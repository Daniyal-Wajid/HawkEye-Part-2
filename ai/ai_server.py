"""
Unified HawkEye AI Server — face recognition, weapons, dresscode, fight detection,
RTSP/offline pipeline, and training endpoints.
"""

import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Generator

import cv2
import numpy as np
from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from enroll import (
    FACE_DB_PATH,
    enroll_face_from_clip_file,
    load_db,
    save_db,
    train_from_frames_dir,
    upsert_student,
)
from video_pipeline import DetectorPipeline

STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = BASE_DIR / "uploads"
ENROLL_UPLOAD_DIR = BASE_DIR / "enroll_uploads"
MODELS_DIR = BASE_DIR / "models"

MODEL_PATH = str(MODELS_DIR / "weapons.pt")
FIGHT_MODEL_PATH = str(MODELS_DIR / "fight_detection_model.h5")
DRESSCODE_MODEL_PATH = str(MODELS_DIR / "dresscode.pt")
ALLOWED_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

processing_lock = threading.Lock()

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

try:
    pipeline = DetectorPipeline(
        model_path=MODEL_PATH,
        face_db_path=FACE_DB_PATH,
        fight_model_path=FIGHT_MODEL_PATH,
        dresscode_model_path=DRESSCODE_MODEL_PATH,
    )
    print(f"[AI Server] DetectorPipeline initialized (weapons: {MODEL_PATH})")
except Exception as e:
    print(f"[AI Server] Error initializing pipeline: {e}")
    pipeline = None


# ── Legacy / integrated endpoints ──────────────────────────────────────────

@app.route("/train", methods=["POST"])
def train():
    if pipeline is None:
        return jsonify({"error": "AI module not initialized"}), 500

    data = request.json or {}
    student_id = data.get("studentId")
    student_name = data.get("studentName")
    frames_dir = data.get("framesDir")

    if not student_id or not frames_dir:
        return jsonify({"error": "Invalid payload: studentId and framesDir required"}), 400

    if not os.path.isabs(frames_dir):
        backend_frames_dir = os.path.join("..", "backend", frames_dir)
        if os.path.exists(backend_frames_dir):
            frames_dir = os.path.abspath(backend_frames_dir)
        else:
            frames_dir = os.path.abspath(frames_dir)

    print(f"[AI Server] Training student {student_id} ({student_name}) from {frames_dir}")
    success = train_from_frames_dir(frames_dir, student_id, student_name=student_name)
    if not success:
        return jsonify({"error": "Training failed (no faces found or other error)"}), 400

    pipeline._load_face_db()
    return jsonify({"status": "trained", "message": f"Successfully trained {student_id}"}), 200


@app.route("/recognize", methods=["POST"])
def recognize():
    if pipeline is None:
        return jsonify({"error": "AI module not initialized"}), 500

    file = request.files.get("frame")
    if not file:
        return jsonify({"error": "No frame received"}), 400

    npimg = np.frombuffer(file.read(), np.uint8)
    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"error": "Failed to decode image", "recognized": False}), 400

    with processing_lock:
        analysis = pipeline.analyze_frame(frame)

    best = next((r for r in analysis["results"] if r["recognized"]), None)
    if not best:
        return jsonify({"recognized": False})

    return jsonify({"recognized": True, "studentId": best["student_id"]})


@app.route("/recognize-live", methods=["POST"])
def recognize_live():
    if pipeline is None:
        return jsonify({"error": "AI module not initialized"}), 500

    try:
        file = request.files.get("frame")
        if not file:
            return jsonify({"error": "No frame received"}), 400

        npimg = np.frombuffer(file.read(), np.uint8)
        frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"error": "Failed to decode image", "recognized": False}), 400

        print(f"[AI Server] Analyzing frame ({frame.shape[1]}x{frame.shape[0]})")
        with processing_lock:
            analysis = pipeline.analyze_frame(frame)

        print(
            f"[AI Server] Done: {analysis['count']} faces, "
            f"{len(analysis['weapon_detections'])} weapons, "
            f"fight={bool(analysis.get('fight_detection'))}, "
            f"dresscode={len(analysis.get('dresscode_violations', []))}"
        )

        return jsonify(analysis)

    except Exception as e:
        print(f"[AI Server] CRITICAL Error in /recognize-live: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "recognized": False}), 500


# ── Pipeline / streaming endpoints (from project/app.py) ───────────────────

@app.get("/api/stats")
def get_stats():
    if pipeline is None:
        return jsonify({"status": "error", "error": "Pipeline not initialized"}), 500
    return jsonify(pipeline.get_stats())


@app.post("/api/start")
def start_processing():
    if pipeline is None:
        return jsonify({"ok": False, "error": "Pipeline not initialized"}), 500

    payload = request.get_json(silent=True) or {}
    source_type = str(payload.get("source_type", "file")).strip().lower()
    source = str(payload.get("source", "")).strip()
    location = payload.get("location", "Camera Feed")
    camera_id = payload.get("camera_id")
    camera_name = payload.get("camera_name")

    if source_type not in ("file", "ip_camera"):
        return jsonify({"ok": False, "error": "source_type must be 'file' or 'ip_camera'"}), 400
    if not source:
        return jsonify({"ok": False, "error": "source is required"}), 400

    if source_type == "file":
        source_path = (BASE_DIR / source).resolve() if not Path(source).is_absolute() else Path(source)
        if not source_path.exists():
            source_path = (UPLOAD_DIR / source).resolve()
        if not source_path.exists():
            return jsonify({"ok": False, "error": f"File not found: {source}"}), 400
        source = str(source_path)

    pipeline.set_context(location=location, camera_id=camera_id, camera_name=camera_name)
    pipeline.start(source=source, source_type=source_type)
    return jsonify({"ok": True, "message": "Processing started"})


@app.post("/api/process_offline")
def process_offline_api():
    if pipeline is None:
        return jsonify({"ok": False, "error": "Pipeline not initialized"}), 500

    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", "")).strip()
    if not source:
        return jsonify({"ok": False, "error": "source is required"}), 400

    source_path = (BASE_DIR / source).resolve() if not Path(source).is_absolute() else Path(source)
    if not source_path.exists():
        source_path = (UPLOAD_DIR / source).resolve()
    if not source_path.exists():
        return jsonify({"ok": False, "error": f"File not found: {source}"}), 400

    output_filename = f"processed_{source_path.stem}.mp4"
    output_path = STATIC_DIR / output_filename
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    pipeline.stop()
    with pipeline.lock:
        pipeline.stats.status = "initializing_offline"

    def run_process():
        pipeline.process_file_offline(str(source_path), str(output_path))

    threading.Thread(target=run_process, daemon=True).start()
    return jsonify({
        "ok": True,
        "message": "Offline processing started",
        "output_url": f"/static/{output_filename}",
    })


@app.post("/api/stop")
def stop_processing():
    if pipeline:
        pipeline.stop()
    return jsonify({"ok": True, "message": "Processing stopped"})


@app.post("/api/pause")
def pause_processing():
    if pipeline:
        pipeline.pause()
    return jsonify({"ok": True, "message": "Processing paused"})


@app.post("/api/resume")
def resume_processing():
    if pipeline:
        pipeline.resume()
    return jsonify({"ok": True, "message": "Processing resumed"})


@app.post("/api/settings")
def update_settings():
    if pipeline is None:
        return jsonify({"ok": False, "error": "Pipeline not initialized"}), 500

    payload = request.get_json(silent=True) or {}
    pipeline.update_settings(
        frame_skip=payload.get("frame_skip"),
        object_stride=payload.get("object_stride"),
        face_stride=payload.get("face_stride"),
        fight_stride=payload.get("fight_stride"),
        dresscode_stride=payload.get("dresscode_stride"),
        process_width=payload.get("process_width"),
        target_fps=payload.get("target_fps"),
        conf_threshold=payload.get("conf_threshold"),
        iou_threshold=payload.get("iou_threshold"),
        fight_threshold=payload.get("fight_threshold"),
        dresscode_threshold=payload.get("dresscode_threshold"),
        face_tolerance=payload.get("face_tolerance"),
        jpeg_quality=payload.get("jpeg_quality"),
    )
    return jsonify({"ok": True, "message": "Settings updated", "stats": pipeline.get_stats()})


@app.get("/video_feed")
def video_feed():
    def stream() -> Generator[bytes, None, None]:
        while True:
            frame = pipeline.get_latest_jpeg() if pipeline else None
            if frame is None:
                time.sleep(0.05)
                continue
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            )
            time.sleep(0.02)

    resp = Response(stream(), mimetype="multipart/x-mixed-replace; boundary=frame")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.get("/api/files")
def list_video_files():
    files = []
    for folder in (UPLOAD_DIR, BASE_DIR):
        if not folder.exists():
            continue
        for item in folder.iterdir():
            if item.is_file() and item.suffix.lower() in ALLOWED_EXTS:
                files.append(item.name)
    files = sorted(set(files))
    return jsonify({"ok": True, "files": files})


@app.post("/api/upload_and_process")
def upload_and_process():
    if pipeline is None:
        return jsonify({"ok": False, "error": "Pipeline not initialized"}), 500

    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"ok": False, "error": "Empty filename"}), 400

    filename = secure_filename(uploaded.filename)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({"ok": False, "error": f"Unsupported format: {ext}"}), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    input_path = UPLOAD_DIR / filename
    uploaded.save(input_path)

    output_filename = f"processed_{filename}"
    output_path = STATIC_DIR / output_filename
    pipeline.stop()

    def run_processing():
        pipeline.process_file_offline(str(input_path), str(output_path))

    threading.Thread(target=run_processing, daemon=True).start()
    return jsonify({
        "ok": True,
        "message": "Processing started",
        "output_url": f"/static/{output_filename}",
    })


@app.post("/api/enroll")
def enroll_from_clip():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file part in request"}), 400

    name = str(request.form.get("name", "")).strip()
    if not name:
        return jsonify({"ok": False, "error": "Name is required"}), 400

    try:
        clip_seconds = int(request.form.get("clip_seconds", 10))
        target_frames = int(request.form.get("target_frames", 120))
        min_samples = int(request.form.get("min_samples", 30))
    except ValueError:
        return jsonify({"ok": False, "error": "clip_seconds, target_frames, min_samples must be numbers"}), 400

    uploaded = request.files["file"]
    if not uploaded or not uploaded.filename:
        return jsonify({"ok": False, "error": "No clip selected"}), 400

    filename = secure_filename(uploaded.filename)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({"ok": False, "error": f"Unsupported file type: {ext}"}), 400

    ENROLL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = ENROLL_UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    uploaded.save(temp_path)

    try:
        embedding = enroll_face_from_clip_file(
            str(temp_path),
            clip_seconds=clip_seconds,
            target_frames=target_frames,
            min_samples=min_samples,
        )
        if not embedding:
            return jsonify({"ok": False, "error": "Enrollment failed. Use a clearer clip with one face."}), 400

        db = load_db()
        upsert_student(db, name, embedding, name=name)
        save_db(db)
        if pipeline:
            pipeline._load_face_db()
        return jsonify({"ok": True, "message": f"Enrollment successful for '{name}'"})
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.get("/health")
def health():
    return jsonify({"status": "ok", "pipeline": pipeline is not None})


if __name__ == "__main__":
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.run(host="0.0.0.0", port=8000, debug=False, threaded=True)
