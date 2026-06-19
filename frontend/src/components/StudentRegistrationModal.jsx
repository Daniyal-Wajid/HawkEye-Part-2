import { useState, useRef, useEffect } from "react";
import { X, Upload, CheckCircle, AlertCircle, Camera, StopCircle, RefreshCw, Video } from "lucide-react";
import { API_BASE, authHeaders } from "../lib/api";

export default function StudentRegistrationModal({ isOpen, onClose, onRefresh }) {
    const [form, setForm] = useState({
        name: "",
        rollNumber: "",
        email: "",
        department: "",
        password: "",
        confirmPassword: "",
    });

    const [video, setVideo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Webcam/IP recording states
    const [sourceType, setSourceType] = useState('webcam'); // 'webcam' | 'ip'
    const [ipUrl, setIpUrl] = useState("http://192.168.1.5:8080/video");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingMode, setRecordingMode] = useState("upload"); // 'upload' or 'record'
    const [recordTime, setRecordTime] = useState(0);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isFaceDetected, setIsFaceDetected] = useState(false);
    const [isVideoSaved, setIsVideoSaved] = useState(false);
    const [showSaveDiscardButtons, setShowSaveDiscardButtons] = useState(false);

    const videoRef = useRef(null);
    const imgRef = useRef(null); // For IP Stream
    const canvasOverlayRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const steamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const detectionIntervalRef = useRef(null);
    const videoMimeTypeRef = useRef('video/webm');

    const stopDetection = () => {
        if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
            detectionIntervalRef.current = null;
        }
        setIsFaceDetected(false);
    };

    const startDetection = () => {
        if (detectionIntervalRef.current) return;

        detectionIntervalRef.current = setInterval(async () => {
            // Only run detection in record mode
            if (recordingMode !== 'record') return;
            
            let source = null;
            let width = 0;
            let height = 0;

            if (sourceType === 'webcam' && videoRef.current) {
                source = videoRef.current;
                width = source.videoWidth || 0;
                height = source.videoHeight || 0;
            } else if (sourceType === 'ip' && imgRef.current) {
                source = imgRef.current;
                width = source.naturalWidth || 0;
                height = source.naturalHeight || 0;
            }

            if (!source || !isCameraActive || width === 0 || height === 0) return;
            
            // Additional check to ensure source is still valid
            if (!source.offsetWidth && !source.videoWidth && !source.naturalWidth) return;

            const canvas = document.createElement("canvas");
            if (!canvas) return;
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            
            ctx.drawImage(source, 0, 0, width, height);

            const base64Image = canvas.toDataURL("image/jpeg", 0.5);
            // console.debug("[Pre-check] Analyzing frame for faces...");

            try {
                const res = await fetch(`${API_BASE}/api/recognition/live`, {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ imageBase64: base64Image })
                });

                const data = await res.json();
                if (res.ok) {
                    setIsFaceDetected(data.count > 0);
                    // Draw detection box on overlay
                    // Only draw if we're in record mode and canvas exists
                    if (recordingMode === 'record' && canvasOverlayRef.current && source) {
                        const canvas = canvasOverlayRef.current;
                        // Double-check canvas is still available and in DOM
                        if (!canvas || !canvas.parentElement) return;
                        
                        const overlayCtx = canvas.getContext("2d");
                        if (!overlayCtx) return;

                        // Sync canvas size with display size
                        const clientW = source.clientWidth || source.offsetWidth || width;
                        const clientH = source.clientHeight || source.offsetHeight || height;

                        if (clientW > 0 && clientH > 0) {
                            canvas.width = clientW;
                            canvas.height = clientH;

                            overlayCtx.clearRect(0, 0, canvas.width, canvas.height);

                            if (width > 0 && height > 0) {
                                const scaleX = clientW / width;
                                const scaleY = clientH / height;

                                overlayCtx.strokeStyle = data.count > 0 ? "#22c55e" : "#ef4444";
                                overlayCtx.lineWidth = 3;
                                overlayCtx.setLineDash([5, 5]);

                                (data.faces || []).forEach(face => {
                                    overlayCtx.strokeRect(face.x * scaleX, face.y * scaleY, face.w * scaleX, face.h * scaleY);
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Pre-check failed:", err);
            }
        }, 1000);
    };

    const startCamera = async () => {
        if (sourceType === 'ip') {
            if (!ipUrl) {
                setError("Please enter a valid IP URL");
                return;
            }
            setIsCameraActive(true);
            setError("");
            startDetection();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: false
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
            steamRef.current = stream;
            setIsCameraActive(true);
            setError("");
            startDetection();
        } catch (err) {
            setError("Could not access webcam. Please check permissions.");
        }
    };

    const stopCamera = () => {
        if (steamRef.current) {
            steamRef.current.getTracks().forEach(track => track.stop());
            steamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
        setIsRecording(false);
        clearInterval(timerRef.current);
        stopDetection();
    };

    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            stopDetection();
        }
    }, [isOpen]);

    useEffect(() => {
        // Stop detection when switching to upload mode
        if (recordingMode === 'upload') {
            stopDetection();
        }
    }, [recordingMode]);

    if (!isOpen) return null;

    const startRecording = () => {
        chunksRef.current = [];
        setIsVideoSaved(false);
        setShowSaveDiscardButtons(false);
        let streamToRecord = null;

        if (sourceType === 'webcam') {
            streamToRecord = steamRef.current;
        } else if (sourceType === 'ip' && imgRef.current) {
            // Create a stream from the image using a temporary canvas loop
            const canvas = document.createElement("canvas");
            canvas.width = imgRef.current.naturalWidth || 1280;
            canvas.height = imgRef.current.naturalHeight || 720;
            const ctx = canvas.getContext("2d");

            // Create a stream from canvas
            streamToRecord = canvas.captureStream(30);

            // Loop to draw image to canvas
            const drawLoop = () => {
                if (!isRecording && !isCameraActive) return;
                if (imgRef.current) {
                    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
                }
                requestAnimationFrame(drawLoop);
            };
            drawLoop();
        }

        if (!streamToRecord) {
            setError("No active stream to record");
            return;
        }

        const options = { mimeType: 'video/webm;codecs=vp8,opus' };

        // Check supported types
        const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        let selectedType = types.find(type => MediaRecorder.isTypeSupported(type));
        videoMimeTypeRef.current = selectedType || 'video/webm';

        const recorder = new MediaRecorder(streamToRecord, { mimeType: videoMimeTypeRef.current });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        recorder.onstop = () => {
            // Don't automatically set video - wait for user to save or discard
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setShowSaveDiscardButtons(true);
            setRecordTime(10);
            // chunksRef.current already contains all the chunks from ondataavailable
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordTime(0);

        // 10 second timer
        timerRef.current = setInterval(() => {
            setRecordTime(prev => {
                const nextTime = prev + 1;
                if (nextTime >= 10) {
                    clearInterval(timerRef.current);
                    stopRecording();
                    return 10;
                }
                return nextTime;
            });
        }, 1000);
    };

    const saveVideo = () => {
        if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: videoMimeTypeRef.current });
            const file = new File([blob], `registration_${Date.now()}.webm`, { type: videoMimeTypeRef.current });
            setVideo(file);
            setIsVideoSaved(true);
            setShowSaveDiscardButtons(false);
        }
    };

    const discardVideo = () => {
        chunksRef.current = [];
        setVideo(null);
        setIsVideoSaved(false);
        setShowSaveDiscardButtons(false);
        setRecordTime(0);
    };

    const stopRecording = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password !== form.confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (!video || !isVideoSaved) {
            setError("Need to upload or create video. Please save the recorded video or upload a file.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append("name", form.name);
            formData.append("rollNumber", form.rollNumber);
            formData.append("email", form.email);
            formData.append("department", form.department);
            formData.append("password", form.password);
            formData.append("confirmPassword", form.confirmPassword);
            formData.append("video", video);

            const res = await fetch(`${API_BASE}/api/students/register`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Registration failed");
            }

            setSuccess(true);
            if (onRefresh) onRefresh();

            stopCamera();

            setTimeout(() => {
                onClose();
                setSuccess(false);
                setForm({ name: "", rollNumber: "", email: "", department: "", password: "", confirmPassword: "" });
                setVideo(null);
                setIsVideoSaved(false);
                setShowSaveDiscardButtons(false);
                setRecordingMode("upload");
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[90vh] md:h-auto">

                {/* Left Side: Video Section */}
                <div className="md:w-1/2 bg-slate-50 p-8 flex flex-col items-center justify-center border-r relative min-h-[400px]">
                    <div className="absolute top-6 left-8">
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Video className="text-blue-600" />
                            Capture Identity
                        </h3>
                        <p className="text-sm text-slate-500">10 seconds to secure your profile</p>
                    </div>

                    <div className="w-full mt-12">
                        {/* Source Selectors */}
                        {recordingMode === 'record' && (
                            <div className="flex bg-slate-200 p-1 rounded-xl mb-4 w-fit mx-auto shadow-inner">
                                <button
                                    onClick={() => setSourceType('webcam')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceType === 'webcam' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Webcam
                                </button>
                                <button
                                    onClick={() => setSourceType('ip')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceType === 'ip' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    IP Cam
                                </button>
                            </div>
                        )}

                        {recordingMode === 'record' && sourceType === 'ip' && (
                            <div className="flex gap-2 max-w-sm mx-auto mb-4">
                                <input
                                    value={ipUrl}
                                    onChange={(e) => setIpUrl(e.target.value)}
                                    className="flex-1 bg-white border border-slate-300 text-slate-800 text-xs px-3 py-2 rounded-lg outline-none focus:border-blue-500"
                                    placeholder="http://192.168.1.x:8080/video"
                                />
                                <button onClick={() => { setIsCameraActive(true); startDetection(); }} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-500">
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        )}

                        <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-6 w-fit mx-auto shadow-inner">
                            <button
                                onClick={() => { 
                                    setRecordingMode("upload"); 
                                    stopCamera();
                                    setIsVideoSaved(false);
                                    setShowSaveDiscardButtons(false);
                                }}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${recordingMode === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Upload File
                            </button>
                            <button
                                onClick={() => {
                                    setRecordingMode("record");
                                    setIsVideoSaved(false);
                                    setShowSaveDiscardButtons(false);
                                }}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${recordingMode === 'record' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Record Live
                            </button>
                        </div>

                        {recordingMode === "upload" ? (
                            <div className="relative border-2 border-dashed border-slate-300 rounded-[2rem] p-12 hover:border-blue-500 hover:bg-blue-50/50 transition-all group flex flex-col items-center gap-4 cursor-pointer">
                                <input
                                    type="file"
                                    accept="video/*"
                                    onChange={(e) => {
                                        setVideo(e.target.files[0]);
                                        setIsVideoSaved(true);
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <div className="p-5 bg-white rounded-2xl shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                                    <Upload size={32} />
                                </div>
                                <div className="text-center">
                                    <span className="block text-slate-800 font-bold">
                                        {video ? video.name : "Choose video file"}
                                    </span>
                                    <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">MP4, WebM up to 50MB</span>
                                </div>
                            </div>
                        ) : (
                            <div className="relative rounded-[2rem] overflow-hidden bg-black aspect-video shadow-2xl group border-4 border-white flex items-center justify-center">
                                {sourceType === 'webcam' ? (
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <img
                                        ref={imgRef}
                                        src={isCameraActive ? `${API_BASE}/api/stream/proxy?url=${encodeURIComponent(ipUrl)}` : ""}
                                        crossOrigin="anonymous"
                                        alt="IP Cam"
                                        className="w-full h-full object-contain"
                                        onError={() => isCameraActive && setError("IP Camera Stream Failed")}
                                    />
                                )}

                                <canvas
                                    ref={canvasOverlayRef}
                                    className="absolute inset-0 pointer-events-none w-full h-full"
                                />

                                {isCameraActive && (
                                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
                                        <div className={`w-2 h-2 rounded-full ${isFaceDetected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                                        <span className="text-[9px] uppercase font-black tracking-widest text-white">
                                            {isFaceDetected ? 'Face Locked' : 'Searching Face'}
                                        </span>
                                    </div>
                                )}

                                {!isCameraActive && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 p-6 text-center">
                                        <button
                                            onClick={startCamera}
                                            className="p-5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-500 transition-all active:scale-95 mb-4"
                                        >
                                            <Camera size={32} />
                                        </button>
                                        <p className="text-white font-bold">Activate Camera</p>
                                        <p className="text-slate-400 text-xs mt-2">Required for ID validation</p>
                                    </div>
                                )}

                                {isCameraActive && (
                                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
                                        {showSaveDiscardButtons ? (
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={saveVideo}
                                                    className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-green-500 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                                                >
                                                    <CheckCircle size={18} />
                                                    Save Video
                                                </button>
                                                <button
                                                    onClick={discardVideo}
                                                    className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 active:scale-95"
                                                >
                                                    <X size={18} />
                                                    Discard
                                                </button>
                                            </div>
                                        ) : !isRecording ? (
                                            <button
                                                onClick={startRecording}
                                                className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-red-500 transition-all shadow-xl shadow-red-500/20 active:scale-95"
                                            >
                                                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                                                Start 10s Recording
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                                                <div className="flex items-center gap-2 text-white font-mono text-sm">
                                                    <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                                                    00:{recordTime.toString().padStart(2, '0')}
                                                </div>
                                                <button onClick={stopRecording} className="text-white hover:text-red-400 transition-colors">
                                                    <StopCircle size={20} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isVideoSaved && !isRecording && isCameraActive && (
                                    <div className="absolute top-4 right-4 bg-green-500 text-white p-2 rounded-lg shadow-lg">
                                        <CheckCircle size={20} />
                                    </div>
                                )}

                                <button
                                    onClick={isCameraActive ? stopCamera : startCamera}
                                    className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl transition-all"
                                >
                                    <RefreshCw size={18} className={isRecording ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Form Section */}
                <div className="md:w-1/2 p-8 md:p-12 overflow-y-auto">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-800">Registration</h2>
                            <p className="text-slate-500 font-medium">Create your secure profile</p>
                        </div>
                        <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400 hover:text-slate-800 mt-[-10px]">
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-2xl flex items-center gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle size={20} />
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                        )}

                        {success && (
                            <div className="bg-green-50 text-green-600 p-4 rounded-2xl flex items-center gap-3 border border-green-100 animate-in fade-in slide-in-from-top-2">
                                <CheckCircle size={20} />
                                <p className="text-sm font-bold">Successfully Registered! Training AI...</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Full Name</label>
                                <input
                                    required
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Ahmed Khan"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Roll Number</label>
                                <input
                                    required
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.rollNumber}
                                    onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                                    placeholder="CS-2024-001"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="ahmed@university.edu"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Department</label>
                                <input
                                    required
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.department}
                                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                                    placeholder="Computer Science"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Password</label>
                                <input
                                    required
                                    type="password"
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Confirm</label>
                                <input
                                    required
                                    type="password"
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                    value={form.confirmPassword}
                                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            disabled={loading || success}
                            className="w-full bg-blue-600 text-white py-4 mt-4 rounded-[1.25rem] font-black text-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-500/20 active:scale-[0.98]"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center gap-3">
                                    <RefreshCw className="animate-spin" />
                                    Finalizing...
                                </div>
                            ) : (
                                "Complete Registration"
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
