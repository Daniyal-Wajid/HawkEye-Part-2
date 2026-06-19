import { useRef, useEffect, useState, useCallback } from "react";
import { X, Download, Video, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { apiGet } from "../lib/api";

export default function VideoClipModal({ violation: initialViolation, onClose }) {
  const videoRef = useRef(null);
  const [violation, setViolation] = useState(initialViolation);
  const [checking, setChecking] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Re-fetch the violation to pick up a freshly saved clip URL
  const recheckClip = useCallback(async (silent = false) => {
    const id = (violation?._id || violation?.id);
    if (!id) return;
    if (!silent) setChecking(true);
    try {
      const fresh = await apiGet(`/api/violations/${id}`);
      if (fresh) setViolation(fresh);
    } catch (_) {}
    finally { if (!silent) setChecking(false); }
  }, [violation?._id, violation?.id]);

  // Auto-poll every 5 s (up to 6 attempts = 30 s) while no clip URL yet
  useEffect(() => {
    if (violation?.clipUrl) return; // already have it
    const id = violation?._id || violation?.id;
    if (!id) return;
    if (pollCount >= 6) return; // give up after 30 s

    const t = setTimeout(async () => {
      await recheckClip(true);
      setPollCount((n) => n + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [violation?.clipUrl, violation?._id, violation?.id, pollCount, recheckClip]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (videoRef.current && violation?.clipUrl) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [violation?.clipUrl]);

  if (!violation) return null;

  const hasClip = !!violation.clipUrl;
  const ext = violation.clipUrl?.split("?")[0].split(".").pop()?.toLowerCase() || "mp4";
  const stillWaiting = !hasClip && pollCount < 6;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <Video className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Violation Recording</h2>
              <p className="text-xs text-slate-500 capitalize">
                {violation.type} · {violation.time || "—"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Video player */}
        <div className="bg-black aspect-video flex items-center justify-center">
          {hasClip ? (
            <video
              key={violation.clipUrl}
              ref={videoRef}
              controls
              autoPlay
              className="w-full h-full object-contain"
            >
              <source src={violation.clipUrl} type={ext === "mp4" ? "video/mp4" : "video/webm"} />
              Your browser does not support HTML5 video.
            </video>
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-400 p-8">
              {stillWaiting ? (
                <Loader2 className="w-12 h-12 opacity-50 animate-spin text-blue-400" />
              ) : (
                <AlertCircle className="w-12 h-12 opacity-30" />
              )}
              <p className="text-sm font-medium text-slate-300">
                {stillWaiting ? "Generating clip…" : "No recording available"}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                {stillWaiting
                  ? `Checking for recording… (${pollCount}/6)`
                  : "This violation was not captured via live recognition, so no video clip was generated."}
              </p>
              {!stillWaiting && (
                <button
                  onClick={recheckClip}
                  disabled={checking}
                  className="mt-2 flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
                  {checking ? "Checking…" : "Retry"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Violation details */}
        <div className="px-6 py-4 border-t bg-slate-50">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              ["Student", violation.student || violation.studentName || "Unknown"],
              ["Type", violation.type],
              ["Severity", violation.severity],
              ["Status", violation.status],
              ["Confidence", violation.confidence],
              ["Location", violation.location],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">{label}</span>
                <span className="font-medium text-slate-800 text-right capitalize truncate">{value || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t">
          <button
            onClick={recheckClip}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            title="Re-fetch violation to check for a new clip"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Refresh Clip"}
          </button>

          <div className="flex items-center gap-3">
            {hasClip && (
              <a
                href={violation.clipUrl}
                download={`violation-${(violation._id || violation.id || "").slice(0, 8)}.${ext}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 font-medium text-slate-700 transition-colors"
              >
                <Download size={15} />
                Download Clip
              </a>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
