import { useState, useEffect, useCallback } from "react";
import { Eye, Loader2, AlertCircle, Video } from "lucide-react";
import Badge from "./Badge";
import VideoClipModal from "./VideoClipModal";
import { apiGet } from "../lib/api";

export default function ViolationsTableFull() {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedViolation, setSelectedViolation] = useState(null);

  const fetchViolations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet("/api/violations");
      setViolations(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViolations();
    const id = setInterval(() => fetchViolations(true), 30000);
    return () => clearInterval(id);
  }, [fetchViolations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
        <AlertCircle className="shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b">
            <tr>
              <th className="p-4 text-left">ID</th>
              <th className="p-4 text-left">Student</th>
              <th className="p-4 text-left">Type</th>
              <th className="p-4 text-left">Severity</th>
              <th className="p-4 text-left">Confidence</th>
              <th className="p-4 text-left">Location</th>
              <th className="p-4 text-left">Camera</th>
              <th className="p-4 text-left">Time</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {violations.map((v) => (
              <tr key={v._id || v.id} className="border-b hover:bg-slate-50">
                <td className="p-4 font-medium font-mono text-xs">
                  {String(v._id || v.id).slice(0, 8)}…
                </td>

                <td className="p-4">
                  <div className="font-medium">{v.student ?? v.studentName ?? "Unknown"}</div>
                  {v.studentId && (
                    <div className="text-xs text-slate-500">
                      {typeof v.studentId === "object" ? v.studentId?._id : v.studentId}
                    </div>
                  )}
                </td>

                <td className="p-4 capitalize">{v.type ?? "-"}</td>

                <td className="p-4">
                  <Badge text={v.severity ?? "—"} variant={v.severity} />
                </td>

                <td className="p-4">{v.confidence ?? "-"}</td>
                <td className="p-4">{v.location ?? "-"}</td>
                <td className="p-4">{v.camera ?? v.cameraName ?? "-"}</td>
                <td className="p-4 text-slate-500">{v.time ?? "-"}</td>

                <td className="p-4">
                  <Badge text={v.status ?? "Unverified"} variant={v.status} />
                </td>

                <td className="p-4 text-center">
                  <button
                    onClick={() => setSelectedViolation(v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      v.clipUrl
                        ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedViolation && (
        <VideoClipModal
          violation={selectedViolation}
          onClose={() => setSelectedViolation(null)}
        />
      )}
    </>
  );
}
