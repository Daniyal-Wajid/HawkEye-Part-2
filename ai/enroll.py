"""
HawkEye — Face Enrollment (structured face_db.json)
Each entry: { "embedding": [128 floats], "name": "...", "student_id": "uuid", "updated_at": "..." }
Legacy plain-array values are auto-migrated on load.
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import face_recognition
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
FACE_DB_PATH = str(BASE_DIR / "face_db.json")
DEFAULT_STREAM = 0
MIN_FACE_PX = 80
UPSAMPLE = 1


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_entry(key: str, value):
    """Accept legacy plain embedding list or structured object."""
    if isinstance(value, list):
        return {
            "embedding": value,
            "name": key if len(key) < 40 and "-" not in key else None,
            "student_id": key,
            "updated_at": _now_iso(),
        }
    if isinstance(value, dict) and "embedding" in value:
        entry = dict(value)
        entry.setdefault("student_id", key)
        entry.setdefault("updated_at", _now_iso())
        return entry
    return None


def load_db(path=FACE_DB_PATH):
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    db = {}
    for key, val in raw.items():
        entry = normalize_entry(str(key), val)
        if entry:
            sid = str(entry.get("student_id") or key)
            db[sid] = entry
    return db


def save_db(db, path=FACE_DB_PATH):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)
    print(f"[INFO] Database saved to {path} ({len(db)} face(s))")


def upsert_student(db, student_id, embedding, name=None):
    """Store face enrollment keyed by UUID (student_id), not by name."""
    sid = str(student_id)
    if not sid or sid == "None":
        print(f"[ERROR] Cannot upsert with invalid student_id: {student_id}")
        return None
    db[sid] = {
        "embedding": embedding,
        "name": name or db.get(sid, {}).get("name") or "Unknown",
        "student_id": sid,
        "updated_at": _now_iso(),
    }
    print(f"[Face DB] ✓ Upserted {name or 'Unknown'} as {sid}")
    return db[sid]


def _is_stream_source(source):
    if isinstance(source, int):
        return True
    s = str(source).lower()
    return s.startswith("rtsp://") or s.startswith("http://") or s.startswith("https://")


def _collect_clip_frames(source, clip_seconds=10, target_frames=120, preview=True):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open source: {source}")
        return []

    is_stream = _is_stream_source(source)
    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = float(fps) if fps and fps > 0 else 25.0
    max_reads = max(30, int(clip_seconds * fps))
    stride = max(1, int(max_reads / max(1, target_frames)))

    frames = []
    start = time.time()
    reads = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            if is_stream:
                continue
            break
        reads += 1
        if reads % stride == 0:
            frames.append(frame.copy())

        if preview:
            preview_frame = frame.copy()
            cv2.putText(
                preview_frame,
                f"Collected {len(frames)}/{target_frames}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
            )
            cv2.imshow("Enrollment Clip Capture", preview_frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
        if is_stream and (time.time() - start) >= clip_seconds:
            break
        if not is_stream and reads >= max_reads:
            break
        if len(frames) >= target_frames:
            break

    cap.release()
    if preview:
        cv2.destroyAllWindows()
    print(f"[INFO] Captured {len(frames)} frame(s) for enrollment")
    return frames


def _frame_quality_score(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def _extract_embedding_from_frame(frame):
    """High-accuracy single-frame embedding for enrollment."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_locs = face_recognition.face_locations(rgb, model="hog", number_of_times_to_upsample=UPSAMPLE)
    if len(face_locs) != 1:
        return None
    top, right, bottom, left = face_locs[0]
    if (right - left) < MIN_FACE_PX or (bottom - top) < MIN_FACE_PX:
        return None
    encs = face_recognition.face_encodings(rgb, face_locs, num_jitters=2)
    return encs[0] if len(encs) == 1 else None


def enroll_from_frames(frames, min_samples=12):
    """Build a robust median embedding from BGR frames with quality filtering."""
    if not frames:
        return None

    scored = sorted(((_frame_quality_score(f), f) for f in frames), key=lambda x: x[0], reverse=True)
    top_frames = [f for _, f in scored[: min(len(scored), 100)]]

    embeddings = []
    for frame in top_frames:
        enc = _extract_embedding_from_frame(frame)
        if enc is not None:
            embeddings.append(enc)

    if len(embeddings) < min_samples:
        print(f"[ERROR] Low quality enrollment: only {len(embeddings)} usable frames (min {min_samples})")
        return None

    emb = np.array(embeddings)
    center = np.mean(emb, axis=0)
    dists = np.linalg.norm(emb - center, axis=1)
    keep_mask = dists <= np.percentile(dists, 80)
    robust_emb = np.mean(emb[keep_mask], axis=0)
    return robust_emb.tolist()


def enroll_face(name, source=DEFAULT_STREAM, clip_seconds=10, target_frames=120, min_samples=30, preview=True):
    print(f"[INFO] Enrolling '{name}' from source: {source}")
    frames = _collect_clip_frames(source, clip_seconds, target_frames, preview)
    if not frames:
        return None
    return enroll_from_frames(frames, min_samples=min_samples)


def enroll_face_from_clip_file(clip_path, clip_seconds=10, target_frames=120, min_samples=30):
    return enroll_face(
        name="web_enrollment",
        source=clip_path,
        clip_seconds=clip_seconds,
        target_frames=target_frames,
        min_samples=min_samples,
        preview=False,
    )


def train_from_frames_dir(frames_dir, student_id, student_name=None, min_samples=12):
    """Train from extracted JPEG frames (used by /train endpoint)."""
    frames_dir = os.path.abspath(frames_dir)
    if not os.path.isdir(frames_dir):
        print(f"[ERROR] Frames directory not found: {frames_dir}")
        return False

    frame_files = sorted(
        f for f in os.listdir(frames_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    if not frame_files:
        print(f"[ERROR] No frame images in {frames_dir}")
        return False

    frames = []
    for fname in frame_files:
        img = cv2.imread(os.path.join(frames_dir, fname))
        if img is not None:
            frames.append(img)

    embedding = enroll_from_frames(frames, min_samples=min(min_samples, max(5, len(frames) // 4)))
    if not embedding:
        return False

    db = load_db()
    upsert_student(db, student_id, embedding, name=student_name)
    save_db(db)
    print(f"[INFO] Trained student {student_id} ({student_name or 'unknown'}) from {len(frames)} frames")
    return True


def main():
    parser = argparse.ArgumentParser(description="HawkEye Face Enrollment")
    parser.add_argument("--name", type=str, help="Person name or student ID")
    parser.add_argument("--source", default=str(DEFAULT_STREAM))
    parser.add_argument("--duration", type=int, default=10)
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--delete", type=str)
    args = parser.parse_args()

    db = load_db()
    if args.list:
        for sid, entry in db.items():
            print(f"{sid}: {entry.get('name', '?')} ({len(entry['embedding'])} dims)")
        return

    if args.delete:
        if args.delete in db:
            del db[args.delete]
            save_db(db)
            print(f"[INFO] Deleted '{args.delete}'")
        return

    name = args.name or input("Enter person name / student ID: ").strip()
    if not name:
        print("[ERROR] Name cannot be empty")
        return

    try:
        source = int(args.source)
    except ValueError:
        source = args.source

    embedding = enroll_face(
        name,
        source=source,
        clip_seconds=args.duration,
        target_frames=args.frames,
        min_samples=args.min_samples,
    )
    if embedding:
        db = load_db()
        upsert_student(db, name, embedding, name=name)
        save_db(db)


if __name__ == "__main__":
    main()
