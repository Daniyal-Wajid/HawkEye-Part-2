import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../../components/Card";
import { Bell, Eye, Check, X, Loader2, AlertCircle, RefreshCw, ShieldAlert, Video } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import ApproveViolationModal from "../../components/ApproveViolationModal";
import VideoClipModal from "../../components/VideoClipModal";

const POLL_INTERVAL = 20000;

function priorityColor(severity) {
  if (!severity) return "bg-blue-100 text-blue-700";
  const s = severity.toUpperCase();
  if (s === "HIGH") return "bg-red-100 text-red-700";
  if (s === "MED" || s === "MEDIUM") return "bg-orange-100 text-orange-700";
  return "bg-blue-100 text-blue-700";
}

export default function ReviewQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [clipViolation, setClipViolation] = useState(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await apiGet("/api/review-queue");
      setQueue(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleReject = async (violation) => {
    if (!window.confirm(`Dismiss this violation (${violation.type})? This cannot be undone.`)) return;
    setRejectingId(violation._id || violation.id);
    try {
      await apiPatch(`/api/review-queue/${violation._id || violation.id}/reject`, {});
      setQueue((prev) => prev.filter((v) => (v._id || v.id) !== (violation._id || violation.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setRejectingId(null);
    }
  };

  const handleApproved = () => {
    fetchQueue();
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Review Queue</h1>
          <p className="text-slate-500">
            {loading ? "Loading…" : `${queue.length} violation${queue.length !== 1 ? "s" : ""} pending review`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchQueue}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <Bell className="w-6 h-6 text-slate-500" />
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium">
            S
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
          <AlertCircle className="shrink-0" size={18} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent>
          {loading && queue.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <ShieldAlert className="w-12 h-12 opacity-30" />
              <p className="text-base">No violations pending review</p>
              <p className="text-sm text-slate-400">
                Unknown person weapon detections will appear here automatically
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr className="h-12">
                    <th className="p-4 font-medium">Priority</th>
                    <th className="p-4 font-medium">ID</th>
                    <th className="p-4 font-medium">Detected As</th>
                    <th className="p-4 font-medium">Type</th>
                    <th className="p-4 font-medium">Confidence</th>
                    <th className="p-4 font-medium">Location</th>
                    <th className="p-4 font-medium">Time</th>
                    <th className="p-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {queue.map((v) => {
                    const vid = v._id || v.id;
                    const isRejecting = rejectingId === vid;
                    return (
                      <tr key={vid} className="h-16 hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${priorityColor(v.severity)}`}>
                            {v.severity || "HIGH"}
                          </span>
                        </td>

                        <td className="p-4 font-mono text-xs text-slate-500">
                          {String(vid).slice(0, 8)}…
                        </td>

                        <td className="p-4 italic text-slate-400 font-medium">
                          Unknown Person
                        </td>

                        <td className="p-4 text-slate-700 font-medium capitalize">{v.type}</td>
                        <td className="p-4 text-slate-600">{v.confidence || "—"}</td>
                        <td className="p-4 text-slate-600">{v.location || "—"}</td>
                        <td className="p-4 text-slate-500 whitespace-nowrap">{v.time || "—"}</td>

                        <td className="p-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View details / clip */}
                            <button
                              onClick={() => setClipViolation(v)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                v.clipUrl
                                  ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200"
                              }`}
                              title={v.clipUrl ? "Watch Recording" : "View Details"}
                            >
                              {v.clipUrl ? (
                                <Video className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              {v.clipUrl ? "Watch Clip" : "Details"}
                            </button>

                            {/* Approve */}
                            <button
                              onClick={() => setSelectedViolation(v)}
                              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-green-50 rounded-lg transition-colors text-green-600 text-xs font-medium border border-green-200"
                              title="Approve & Identify"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>

                            {/* Reject */}
                            <button
                              onClick={() => handleReject(v)}
                              disabled={isRejecting}
                              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-500 text-xs font-medium border border-red-200 disabled:opacity-50"
                              title="Dismiss"
                            >
                              {isRejecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <X className="w-3.5 h-3.5" />
                              )}
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400 text-right">
            Auto-refreshes every 20 seconds
          </p>
        </CardContent>
      </Card>

      {/* Video clip / detail modal */}
      {clipViolation && (
        <VideoClipModal
          violation={clipViolation}
          onClose={() => setClipViolation(null)}
        />
      )}

      {/* Approve modal */}
      {selectedViolation && (
        <ApproveViolationModal
          violation={selectedViolation}
          onClose={() => setSelectedViolation(null)}
          onDone={handleApproved}
        />
      )}
    </>
  );
}
