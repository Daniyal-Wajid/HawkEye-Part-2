import { useState, useRef, useEffect } from "react";
import { Camera, X, Shield, ShieldAlert, Activity, RefreshCw, Receipt, Play, Square, Pause, Settings, Upload, Film, Loader2, CheckCircle } from "lucide-react";
import {
    API_BASE,
    authHeaders,
    aiGet,
    aiPost,
    aiVideoFeedUrl,
    aiProcessedVideoUrl,
    aiUploadVideo,
} from "../lib/api";

export default function LiveRecognitionPanel({ onClose, cameras = [] }) {
    const videoRef = useRef(null);
    const imgRef = useRef(null); // For IP Cam
    const canvasRef = useRef(null);

    const [sourceType, setSourceType] = useState('webcam'); // webcam | ip | pipeline | offline
    const [ipUrl, setIpUrl] = useState("http://192.168.1.5:8080/video");
    const [rtspUrl, setRtspUrl] = useState("");
    const [selectedCameraId, setSelectedCameraId] = useState("");
    const [isActive, setIsActive] = useState(false);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineStats, setPipelineStats] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [offlineUploading, setOfflineUploading] = useState(false);
    const [offlineProcessing, setOfflineProcessing] = useState(false);
    const [offlineOutputUrl, setOfflineOutputUrl] = useState(null);
    const [offlineStats, setOfflineStats] = useState(null);
    const offlineFileRef = useRef(null);
    const [settings, setSettings] = useState({
        conf_threshold: 0.72,
        fight_threshold: 0.72,
        dresscode_threshold: 0.55,
        frame_skip: 1,
    });

    const [isSyncing, setIsSyncing] = useState(false);
    const [recognitions, setRecognitions] = useState([]);
    const [faces, setFaces] = useState([]);
    const [weaponDetections, setWeaponDetections] = useState([]);
    const [fightDetection, setFightDetection] = useState(null);
    const [dresscodeViolations, setDresscodeViolations] = useState([]);
    const [finesApplied, setFinesApplied] = useState([]);
    const [recentFineAlerts, setRecentFineAlerts] = useState([]);
    const [error, setError] = useState("");
    const [stats, setStats] = useState({ count: 0, lastCheck: null });

    const streamRef = useRef(null);
    const intervalRef = useRef(null);
    const pipelinePollRef = useRef(null);
    const frameCountRef = useRef(0);
    const recognitionPendingRef = useRef(false);

    // Rolling frame buffer — last 10 JPEG frames used to build a clip on violation
    const frameBufferRef = useRef([]); // array of base64 JPEG strings
    const uploadedViolationsRef = useRef(new Set()); // prevent duplicate uploads

    // Smaller resolution = faster detection; bboxes are in this space
    const ANALYSIS_W = 640;
    const ANALYSIS_H = 480;
    const FRAME_SKIP = 3;   // Run detection every 3rd frame
    const INTERVAL_MS = 333; // ~3 ticks/sec → ~1 detection/sec when FRAME_SKIP=3

    useEffect(() => {
        if (sourceType === 'webcam') {
            startCamera();
        }
        verifyBackend();
        return () => {
            stopRecognition();
            stopCamera();
            stopPipeline();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Stop camera when switching modes
    useEffect(() => {
        stopRecognition();
        stopCamera();
        stopPipeline();
        setIsActive(false);
        setError("");

        if (sourceType === 'webcam') {
            setTimeout(startCamera, 100);
        }
    }, [sourceType]);

    const pollPipelineStats = async () => {
        try {
            const data = await aiGet("/stats");
            setPipelineStats(data);
            setOfflineStats(data);
            const running = data.status === "running" || data.status === "paused";
            setPipelineRunning(running);
            const processing = String(data.status || "").includes("processing") || data.status === "converting format" || data.status === "processing_offline";
            if (processing) setOfflineProcessing(true);
            else if (data.status === "stopped" && offlineProcessing && (data.progress >= 99 || data.processed_frames > 0)) {
                setOfflineProcessing(false);
            }
        } catch {
            /* ignore */
        }
    };

    const startPipeline = async () => {
        const cam = cameras.find(c => (c._id || c.id) === selectedCameraId);
        const stream = cam?.stream || rtspUrl.trim();
        if (!stream) {
            setError("Select a registered camera or enter a stream URL");
            return;
        }
        setError("");
        try {
            const data = await aiPost("/start", {
                source_type: "ip_camera",
                source: stream,
                location: cam?.name || "Surveillance Feed",
                camera_id: cam?._id || cam?.id || null,
                camera_name: cam?.name || null,
            });
            if (!data.ok) throw new Error(data.error || "Failed to start pipeline");
            setPipelineRunning(true);
            setIsActive(true);
            if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
            pipelinePollRef.current = setInterval(pollPipelineStats, 2000);
        } catch (err) {
            setError(err.message);
        }
    };

    const stopPipeline = async () => {
        if (pipelinePollRef.current) {
            clearInterval(pipelinePollRef.current);
            pipelinePollRef.current = null;
        }
        try {
            await aiPost("/stop", {});
        } catch { /* ignore */ }
        setPipelineRunning(false);
        setIsActive(false);
        setPipelineStats(null);
    };

    const pausePipeline = async () => {
        await aiPost("/pause", {});
        pollPipelineStats();
    };

    const resumePipeline = async () => {
        await aiPost("/resume", {});
        pollPipelineStats();
    };

    const applySettings = async () => {
        try {
            await aiPost("/settings", settings);
            setShowSettings(false);
            pollPipelineStats();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleOfflineUpload = async (file) => {
        if (!file) return;
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
            setError("Unsupported format. Use MP4, AVI, MOV, MKV, or WEBM.");
            return;
        }
        setError("");
        setOfflineUploading(true);
        setOfflineOutputUrl(null);
        setOfflineProcessing(false);
        try {
            const data = await aiUploadVideo(file);
            if (!data.ok) throw new Error(data.error || "Upload failed");
            setOfflineProcessing(true);
            if (!pipelinePollRef.current) {
                pipelinePollRef.current = setInterval(pollPipelineStats, 1500);
            }
            if (data.output_url) {
                setOfflineOutputUrl(aiProcessedVideoUrl(data.output_url));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setOfflineUploading(false);
        }
    };

    const verifyBackend = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/test`);
            const data = await res.json();
            console.log(`[System] Connected to Backend Process: ${data.processId}`);
        } catch (err) {
            console.error("[System] Could not verify backend connection.");
        }
    };

    const startCamera = async () => {
        if (sourceType === 'ip') {
            if (!ipUrl) {
                setError("Please enter a valid IP URL");
                return;
            }
            setIsActive(true);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: false
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
            setIsActive(true);
            console.log("[Camera] Streaming active");
        } catch (err) {
            console.error("[Camera] Access failed:", err);
            setError("Webcam access denied. Please check permissions.");
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        // For IP cam, just setting isActive false hides the img
    };

    /** Push a JPEG base64 frame into the rolling buffer (keeps last 15 ≈ 15 seconds) */
    const pushFrame = (base64) => {
        frameBufferRef.current.push(base64);
        if (frameBufferRef.current.length > 15) frameBufferRef.current.shift();
    };

    /**
     * Send the buffered frames to the backend so ffmpeg can stitch an MP4.
     * Safe to call even if the buffer only has 1–2 frames.
     */
    const uploadFramesAsClip = async (violationId) => {
        if (!violationId) return;
        if (uploadedViolationsRef.current.has(violationId)) return;
        const frames = [...frameBufferRef.current]; // snapshot
        if (frames.length === 0) {
            console.warn("[Clip] Frame buffer empty — skipping clip for", violationId);
            return;
        }
        uploadedViolationsRef.current.add(violationId);
        try {
            const res = await fetch(`${API_BASE}/api/violations/${violationId}/clip-from-frames`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ frames }),
            });
            if (res.ok) {
                console.log(`[Clip] ✅ MP4 clip saved for violation ${violationId} (${frames.length} frames)`);
            } else {
                const err = await res.json().catch(() => ({}));
                console.warn(`[Clip] Upload failed (${res.status}):`, err.error || res.statusText);
            }
        } catch (e) {
            console.error("[Clip] Upload error:", e.message);
        }
    };

    const startRecognition = () => {
        if (intervalRef.current) return;
        setIsSyncing(true);
        frameBufferRef.current = []; // clear old frames
        console.log("[Detection] Initializing AI Analysis loop...");

        intervalRef.current = setInterval(async () => {
            // Determine source
            let source = null;
            let width = 0;
            let height = 0;

            if (sourceType === 'webcam' && videoRef.current) {
                source = videoRef.current;
                width = source.videoWidth;
                height = source.videoHeight;
            } else if (sourceType === 'ip' && imgRef.current) {
                source = imgRef.current;
                width = source.naturalWidth;
                height = source.naturalHeight;
            }

            if (!source || !isActive || width === 0 || height === 0) {
                return;
            }

            if (recognitionPendingRef.current) {
                return;
            }

            frameCountRef.current = (frameCountRef.current || 0) + 1;
            const shouldDetect = frameCountRef.current % FRAME_SKIP === 0;

            if (!shouldDetect) {
                return;
            }

            // Capture at 640×480 for faster detection (bboxes will be in this space)
            const canvas = document.createElement("canvas");
            canvas.width = ANALYSIS_W;
            canvas.height = ANALYSIS_H;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(source, 0, 0, ANALYSIS_W, ANALYSIS_H);

            const base64Image = canvas.toDataURL("image/jpeg", 0.7);

            // Push into rolling frame buffer (last 10 frames → used as clip on violation)
            pushFrame(base64Image);

            const abortController = new AbortController();
            const requestTimeout = window.setTimeout(() => abortController.abort(), 30000);
            try {
                recognitionPendingRef.current = true;
                const res = await fetch(`${API_BASE}/api/recognition/live`, {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ imageBase64: base64Image }),
                    signal: abortController.signal,
                });

                const data = await res.json();
                if (res.ok) {
                    if (data.count > 0) {
                        console.log(`[Detection] Found ${data.count} faces, ${data.recognitions?.length || 0} recognized`, data.faces);
                    }
                    if (data.weaponDetections?.length > 0) {
                        console.log(`[Detection] ⚠ Weapons: ${data.weaponDetections.map(w => `${w.personLabel} holding ${w.weapon}`).join(", ")}`);
                    }
                    if (data.finesApplied?.length > 0) {
                        console.log(`[Fine] Applied ${data.finesApplied.length} fine(s):`, data.finesApplied);
                        setRecentFineAlerts(data.finesApplied);
                        setTimeout(() => setRecentFineAlerts([]), 10000);
                    }

                    if (data.fightDetection?.detected) {
                        console.log(`[Detection] Fight detected (${(data.fightDetection.confidence * 100).toFixed(0)}%)`);
                    }
                    if (data.dresscodeViolations?.length > 0) {
                        console.log(`[Detection] Dresscode: ${data.dresscodeViolations.map(d => d.type).join(", ")}`);
                    }

                    // Upload frame-based clip for every violation / review-queue entry created
                    if (data.weaponDetections?.length > 0) {
                        for (const w of data.weaponDetections) {
                            const vid = w.violationId || w.reviewViolationId;
                            if (vid) uploadFramesAsClip(vid);
                        }
                    }

                    setRecognitions(data.recognitions || []);
                    setFaces(data.faces || []);
                    setWeaponDetections(data.weaponDetections || []);
                    setFightDetection(data.fightDetection || null);
                    setDresscodeViolations(data.dresscodeViolations || []);
                    setFinesApplied(data.finesApplied || []);
                    setStats({
                        count: data.count || 0,
                        lastCheck: new Date().toLocaleTimeString()
                    });
                }
            } catch (err) {
                if (err.name === "AbortError") {
                    console.warn("[Detection] Request aborted due to timeout.");
                } else {
                    console.error("[Detection] Sync failed:", err);
                }
            } finally {
                window.clearTimeout(requestTimeout);
                recognitionPendingRef.current = false;
            }
        }, INTERVAL_MS);
    };

    const stopRecognition = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        frameCountRef.current = 0;
        frameBufferRef.current = [];
        uploadedViolationsRef.current.clear();
        setIsSyncing(false);
        setRecognitions([]);
        setFaces([]);
        setWeaponDetections([]);
        setFightDetection(null);
        setDresscodeViolations([]);
        setFinesApplied([]);
        setRecentFineAlerts([]);
        console.log("[Detection] AI Analysis loop stopped.");
    };

    // Draw bounding boxes on the overlay canvas
    useEffect(() => {
        const isWebcam = sourceType === 'webcam' && videoRef.current;
        const isIp = sourceType === 'ip' && imgRef.current;

        if (sourceType === 'pipeline' || sourceType === 'offline' || (!isWebcam && !isIp) || !canvasRef.current) return;

        const source = isWebcam ? videoRef.current : imgRef.current;
        const ctx = canvasRef.current.getContext("2d");

        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas || !ctx || !source) return;

            const srcW = isWebcam ? source.videoWidth : source.naturalWidth;
            const srcH = isWebcam ? source.videoHeight : source.naturalHeight;
            const clientW = source.clientWidth;
            const clientH = source.clientHeight;

            if (srcW === 0 || srcH === 0 || clientW === 0 || clientH === 0) {
                requestAnimationFrame(render);
                return;
            }

            canvas.width = clientW;
            canvas.height = clientH;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const scaleX = clientW / ANALYSIS_W;
            const scaleY = clientH / ANALYSIS_H;

            if (fightDetection?.detected) {
                ctx.setLineDash([12, 8]);
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 5;
                ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
                ctx.setLineDash([]);
                ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
                ctx.font = "bold 16px Inter, sans-serif";
                const msg = `FIGHT DETECTED (${Math.round((fightDetection.confidence || 0) * 100)}%)`;
                const textWidth = ctx.measureText(msg).width;
                ctx.fillRect(10, 10, textWidth + 16, 28);
                ctx.fillStyle = "white";
                ctx.fillText(msg, 18, 32);
            }

            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            faces.forEach(face => {
                const isRecognized = recognitions.some(r =>
                    Math.abs(r.faceBox.x - face.x) < 10 &&
                    Math.abs(r.faceBox.y - face.y) < 10 &&
                    Math.abs(r.faceBox.w - face.w) < 10 &&
                    Math.abs(r.faceBox.h - face.h) < 10
                );

                if (!isRecognized && face.w > 0 && face.h > 0) {
                    ctx.strokeStyle = "#94a3b8";
                    ctx.strokeRect(face.x * scaleX, face.y * scaleY, face.w * scaleX, face.h * scaleY);
                    ctx.fillStyle = "#475569";
                    ctx.font = "bold 9px Inter, sans-serif";
                    ctx.fillText("UNKNOWN", (face.x * scaleX) + 4, (face.y * scaleY) + 12);
                }
            });

            ctx.setLineDash([]);
            ctx.lineWidth = 3;
            recognitions.forEach(rec => {
                const box = rec.faceBox;
                const color = "#3b82f6";
                ctx.strokeStyle = color;
                ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.w * scaleX, box.h * scaleY);

                const text = `${rec.student.name || 'Student'}`.toUpperCase();
                const confText = `${Math.round((rec.confidence || 0) * 100)}% MATCH`;
                ctx.font = "bold 11px Inter, sans-serif";
                const textWidth = Math.max(ctx.measureText(text).width, ctx.measureText(confText).width);
                const panelWidth = textWidth + 14;

                ctx.fillStyle = color;
                ctx.fillRect(box.x * scaleX, (box.y * scaleY) - 38, panelWidth, 36);
                ctx.fillStyle = "white";
                ctx.fillText(text, (box.x * scaleX) + 6, (box.y * scaleY) - 22);
                ctx.font = "bold 9px Inter, sans-serif";
                ctx.fillText(confText, (box.x * scaleX) + 6, (box.y * scaleY) - 8);
            });

            weaponDetections.forEach(det => {
                const [x, y, bw, bh] = det.bbox;
                const sx = x * scaleX;
                const sy = y * scaleY;
                const sw = bw * scaleX;
                const sh = bh * scaleY;
                const label = det.personLabel ? `${det.personLabel} holds ${det.weapon}` : `Weapon: ${det.weapon}`;
                ctx.strokeStyle = "#dc2626";
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(sx, sy, sw, sh);
                ctx.setLineDash([]);
                ctx.font = "bold 10px Inter, sans-serif";
                const labelWidth = ctx.measureText(label).width;
                ctx.fillStyle = "#dc2626";
                ctx.fillRect(sx, sy - 24, labelWidth + 12, 22);
                ctx.fillStyle = "white";
                ctx.fillText(label, sx + 6, sy - 8);
            });

            dresscodeViolations.forEach(det => {
                const [x, y, bw, bh] = det.bbox;
                const sx = x * scaleX;
                const sy = y * scaleY;
                const sw = bw * scaleX;
                const sh = bh * scaleY;
                const label = `Dresscode: ${det.type}`;
                ctx.strokeStyle = "#8b5cf6";
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(sx, sy, sw, sh);
                ctx.setLineDash([]);
                ctx.font = "bold 10px Inter, sans-serif";
                const labelWidth = ctx.measureText(label).width;
                ctx.fillStyle = "#8b5cf6";
                ctx.fillRect(sx, sy - 24, labelWidth + 12, 22);
                ctx.fillStyle = "white";
                ctx.fillText(label, sx + 6, sy - 8);
            });

            requestAnimationFrame(render);
        };

        const animId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animId);
    }, [recognitions, faces, weaponDetections, fightDetection, dresscodeViolations, sourceType]);

    return (
        <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row h-full min-h-[500px]">
            {/* Video Stream Area */}
            <div className="flex-1 relative bg-black min-h-[300px] flex items-center justify-center">
                {sourceType === 'webcam' ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover opacity-80"
                    />
                ) : sourceType === 'pipeline' ? (
                    <img
                        src={pipelineRunning ? aiVideoFeedUrl() : ""}
                        alt="Pipeline Feed"
                        className="w-full h-full object-contain opacity-90"
                    />
                ) : sourceType === 'offline' ? (
                    offlineOutputUrl && !offlineProcessing ? (
                        <video src={offlineOutputUrl} controls className="w-full h-full object-contain bg-black" />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-3 p-8">
                            {offlineProcessing ? (
                                <>
                                    <Loader2 className="animate-spin text-blue-400" size={48} />
                                    <p className="font-bold text-white">Processing video… {Math.round(offlineStats?.progress || 0)}%</p>
                                </>
                            ) : (
                                <>
                                    <Film size={48} className="opacity-50" />
                                    <p>Upload a clip to analyze offline</p>
                                </>
                            )}
                        </div>
                    )
                ) : (
                    <img
                        ref={imgRef}
                        src={isActive ? `${API_BASE}/api/stream/proxy?url=${encodeURIComponent(ipUrl)}` : ""}
                        crossOrigin="anonymous"
                        alt="IP Feed"
                        className="w-full h-full object-contain opacity-80"
                        onError={() => {
                            if (isActive) setError("Failed to load IP Camera stream. Check URL and same network.");
                        }}
                    />
                )}

                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 pointer-events-none w-full h-full ${sourceType === 'pipeline' || sourceType === 'offline' ? 'hidden' : ''}`}
                />

                {!isActive && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                        <Camera size={48} className="mb-4 opacity-50" />
                        <p>Camera Off</p>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 text-center bg-slate-900/90 z-20">
                        <p className="text-red-400 font-bold">{error}</p>
                    </div>
                )}

                {/* Live Indicator */}
                <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 z-10">
                    <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="text-[10px] uppercase font-black tracking-widest text-white">
                        {isSyncing ? 'Live Analysis' : 'Standby'}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-400 border-l border-white/20 pl-2 ml-1">
                        {sourceType === 'webcam' ? 'WEBCAM' : sourceType === 'pipeline' ? 'SURVEILLANCE' : sourceType === 'offline' ? 'OFFLINE' : 'IP CAM'}
                    </span>
                </div>

                {/* Fight alert banner */}
                {fightDetection?.detected && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-orange-600/95 backdrop-blur-md px-4 py-2 rounded-xl border-2 border-orange-400 z-20 shadow-lg">
                        <ShieldAlert className="text-white" size={20} />
                        <span className="text-sm font-bold text-white">
                            Fight Detected ({Math.round((fightDetection.confidence || 0) * 100)}%)
                        </span>
                    </div>
                )}

                {/* Dresscode alert banner */}
                {dresscodeViolations.length > 0 && (
                    <div className="absolute top-32 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-purple-600/95 backdrop-blur-md px-4 py-2 rounded-xl border-2 border-purple-400 z-20 shadow-lg">
                        <ShieldAlert className="text-white" size={20} />
                        <span className="text-sm font-bold text-white">
                            Dress Code: {dresscodeViolations.map(d => d.type).join(" · ")}
                        </span>
                    </div>
                )}

                {/* Weapon alert banner */}
                {weaponDetections.length > 0 && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600/95 backdrop-blur-md px-4 py-2 rounded-xl border-2 border-red-400 z-20 shadow-lg">
                        <ShieldAlert className="text-white" size={20} />
                        <span className="text-sm font-bold text-white">
                            {weaponDetections.map(w => w.personLabel ? `${w.personLabel} holding ${w.weapon}` : `Weapon: ${w.weapon}`).join(" · ")}
                        </span>
                    </div>
                )}

                {/* Fine applied alert */}
                {recentFineAlerts.length > 0 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-1 z-20 w-[90%] max-w-md">
                        {recentFineAlerts.map((alert, i) => (
                            <div key={i} className="flex items-center gap-2 bg-amber-500/95 backdrop-blur-md px-4 py-2 rounded-xl border-2 border-amber-300 shadow-lg">
                                <Receipt className="text-white shrink-0" size={18} />
                                <span className="text-sm font-bold text-white">
                                    Fine Applied: {alert.studentName} — Rs. {(alert.amount || 0).toLocaleString()} for {alert.weapon}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Control Panel */}
            <div className="w-full md:w-80 p-8 flex flex-col justify-between bg-slate-900 border-l border-white/10">
                <div className="space-y-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-black text-white italic tracking-tighter">Hawk<span className="text-blue-500">Eye</span></h2>
                            <p className="text-slate-400 text-sm font-semibold mt-1">Real-time Recognition</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Source Switcher */}
                        <div className="flex flex-wrap bg-slate-800 p-1 rounded-xl gap-1">
                            {[
                                { id: 'webcam', icon: Camera, label: 'Webcam' },
                                { id: 'ip', icon: Activity, label: 'IP' },
                                { id: 'pipeline', icon: Play, label: 'Surveillance' },
                                { id: 'offline', icon: Film, label: 'Offline' },
                            ].map(({ id, icon: Icon, label }) => (
                                <button
                                    key={id}
                                    onClick={() => setSourceType(id)}
                                    className={`flex-1 min-w-[70px] flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-all ${sourceType === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <Icon size={13} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {sourceType === 'pipeline' && (
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-3">
                                {cameras.length > 0 && (
                                    <>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registered Camera</label>
                                        <select
                                            value={selectedCameraId}
                                            onChange={(e) => {
                                                setSelectedCameraId(e.target.value);
                                                const cam = cameras.find(c => (c._id || c.id) === e.target.value);
                                                if (cam?.stream) setRtspUrl(cam.stream);
                                            }}
                                            className="w-full bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-lg"
                                        >
                                            <option value="">— Select camera —</option>
                                            {cameras.filter(c => (c.status || "").toLowerCase() === "active").map(cam => (
                                                <option key={cam._id || cam.id} value={cam._id || cam.id}>{cam.name}</option>
                                            ))}
                                        </select>
                                    </>
                                )}
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Stream URL (RTSP / HTTP)</label>
                                <input
                                    value={rtspUrl}
                                    onChange={(e) => setRtspUrl(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-lg focus:border-blue-500 outline-none"
                                    placeholder="rtsp://user:pass@192.168.1.10/stream"
                                />
                                <div className="flex gap-2">
                                    {!pipelineRunning ? (
                                        <button onClick={startPipeline} className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-bold">
                                            <Play size={14} /> Start
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={pausePipeline} className="flex-1 flex items-center justify-center gap-1 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg text-xs font-bold">
                                                <Pause size={14} /> Pause
                                            </button>
                                            <button onClick={resumePipeline} className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-bold">
                                                <Play size={14} /> Resume
                                            </button>
                                            <button onClick={stopPipeline} className="flex-1 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-xs font-bold">
                                                <Square size={14} /> Stop
                                            </button>
                                        </>
                                    )}
                                    <button onClick={() => setShowSettings(!showSettings)} className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg">
                                        <Settings size={14} />
                                    </button>
                                </div>
                                {showSettings && (
                                    <div className="space-y-2 pt-2 border-t border-slate-700">
                                        {[
                                            { key: "conf_threshold", label: "Weapon conf", max: 0.99, step: 0.01 },
                                            { key: "fight_threshold", label: "Fight conf", max: 0.99, step: 0.01 },
                                            { key: "dresscode_threshold", label: "Dresscode conf", max: 0.99, step: 0.01 },
                                        ].map(({ key, label, max, step }) => (
                                            <div key={key}>
                                                <label className="text-[10px] text-slate-400">{label}: {settings[key]}</label>
                                                <input
                                                    type="range"
                                                    min={0.2}
                                                    max={max}
                                                    step={step}
                                                    value={settings[key]}
                                                    onChange={(e) => setSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
                                                    className="w-full"
                                                />
                                            </div>
                                        ))}
                                        <button onClick={applySettings} className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs font-bold">Apply Settings</button>
                                    </div>
                                )}
                                {pipelineStats && (
                                    <p className="text-[10px] text-slate-400">
                                        {pipelineStats.status} · {pipelineStats.fps?.toFixed?.(1) || 0} FPS · {pipelineStats.detections || 0} det
                                    </p>
                                )}
                            </div>
                        )}

                        {sourceType === 'offline' && (
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-3">
                                <input ref={offlineFileRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleOfflineUpload(e.target.files?.[0])} />
                                <button
                                    onClick={() => offlineFileRef.current?.click()}
                                    disabled={offlineUploading || offlineProcessing}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-bold"
                                >
                                    {offlineUploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                    {offlineUploading ? "Uploading…" : offlineProcessing ? "Processing…" : "Upload & Analyze Video"}
                                </button>
                                {offlineStats && offlineProcessing && (
                                    <p className="text-[10px] text-slate-400 capitalize">{offlineStats.status} · {Math.round(offlineStats.progress || 0)}%</p>
                                )}
                                {offlineOutputUrl && !offlineProcessing && (
                                    <p className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> Analysis complete — play result on the left</p>
                                )}
                            </div>
                        )}

                        {sourceType === 'ip' && (
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Camera URL</label>
                                <div className="flex gap-2">
                                    <input
                                        value={ipUrl}
                                        onChange={(e) => setIpUrl(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-lg focus:border-blue-500 outline-none"
                                        placeholder="http://192.168.x.x/video"
                                    />
                                    <button
                                        onClick={() => setIsActive(true)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="flex items-center gap-3 text-slate-400 mb-2">
                                <Activity size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Analysis Status</span>
                            </div>
                            <p className="text-white font-bold">{isSyncing ? "Detecting Faces..." : "Camera Active"}</p>
                        </div>

                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="flex items-center gap-3 text-slate-400 mb-2">
                                <Shield size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Match Found</span>
                            </div>
                            <p className="text-white font-bold">{recognitions.length} Subject(s)</p>
                        </div>

                        {finesApplied.length > 0 && (
                            <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/20">
                                <div className="flex items-center gap-3 text-amber-400 mb-2">
                                    <Receipt size={16} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Fines Applied</span>
                                </div>
                                <div className="space-y-1">
                                    {finesApplied.map((f, i) => (
                                        <p key={i} className="text-xs text-amber-300 font-semibold">
                                            {f.studentName}: Rs. {(f.amount || 0).toLocaleString()} ({f.weapon})
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {recognitions.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Detected Subjects</p>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {recognitions.map((rec, i) => {
                                    const hasFine = finesApplied.some(f => f.studentId === rec.student._id || f.studentId === rec.student.id);
                                    return (
                                        <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${hasFine ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/10 border-blue-500/20'}`}>
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs capitalize ${hasFine ? 'bg-amber-500' : 'bg-blue-600'}`}>
                                                {rec.student.name[0]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white leading-none">{rec.student.name}</p>
                                                <p className={`text-[10px] font-bold mt-1 ${hasFine ? 'text-amber-400' : 'text-blue-400'}`}>
                                                    {Math.round(rec.confidence * 100)}% Match
                                                </p>
                                            </div>
                                            {hasFine && (
                                                <span className="text-[9px] font-black text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                                    Fined
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 mt-8">
                    {sourceType !== 'pipeline' && sourceType !== 'offline' && (
                        !isSyncing ? (
                            <button
                                onClick={startRecognition}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                            >
                                Initialize AI
                            </button>
                        ) : (
                            <button
                                onClick={stopRecognition}
                                className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-500 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all border border-red-500/20"
                            >
                                Stop Syncing
                            </button>
                        )
                    )}

                    {sourceType === 'pipeline' && pipelineRunning && (
                        <p className="text-[10px] text-center text-emerald-400 font-bold uppercase">
                            Pipeline running — violations auto-reported to backend
                        </p>
                    )}

                    <p className="text-[10px] text-center text-slate-600 font-bold uppercase">
                        Last sync: {stats.lastCheck || "Never"}
                    </p>
                </div>
            </div>
        </div>
    );
}
