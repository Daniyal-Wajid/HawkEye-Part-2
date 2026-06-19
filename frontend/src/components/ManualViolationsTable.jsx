import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Loader2, AlertCircle, ClipboardCheck } from "lucide-react";
import Badge from "./Badge";
import ManualViolationReviewModal from "./ManualViolationReviewModal";
import { apiGet } from "../lib/api";

function subjectSummary(v) {
  const parts = [v.subject_student_name, v.subject_sap_id, v.subject_department].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function truncate(text, max) {
  if (!text) return "—";
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export default function ManualViolationsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewRow, setReviewRow] = useState(null);
  /** Admin and discipline incharge (and legacy `teacher`) may attach reward points on approve. */
  const canGiveRewards = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      const r = u.role;
      return r === "admin" || r === "discipline_incharge" || r === "teacher";
    } catch {
      return false;
    }
  })();

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet("/api/manual-violations");
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    const id = setInterval(() => fetchRows(true), 15000);
    return () => clearInterval(id);
  }, [fetchRows]);

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

  if (rows.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-600 text-sm">
        No manual violation reports yet. Reports submitted from the student mobile app will appear here.
      </div>
    );
  }

  return (
    <>
    <p className="text-xs text-slate-500 mb-2">
      Use <span className="font-semibold text-slate-700">Review</span> to approve, reject, or add notes. Scroll sideways for more columns — actions stay pinned on the left.
    </p>
    <div className="bg-white border rounded-xl overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[920px]">
        <thead className="bg-slate-50 text-slate-600 border-b">
          <tr>
            <th className="p-3 text-center align-middle w-[132px] min-w-[132px] sticky left-0 z-20 bg-slate-50 border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
              Actions
            </th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-left">ID</th>
            <th className="p-4 text-left">Reporter</th>
            <th className="p-4 text-left">Category</th>
            <th className="p-4 text-left">Description</th>
            <th className="p-4 text-left">Location</th>
            <th className="p-4 text-left">Subject</th>
            <th className="p-4 text-left">Media</th>
            <th className="p-4 text-left">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="border-b hover:bg-slate-50 group">
              <td className="p-3 align-middle text-center sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100">
                <div className="flex flex-col items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewRow(v)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 shadow-sm"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                    Review
                  </button>
                  {v.evidenceSignedUrl ? (
                    <a
                      href={v.evidenceSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      Open file
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400 leading-tight">No file link</span>
                  )}
                </div>
              </td>
              <td className="p-4">
                <Badge text={v.status ?? "pending"} variant={v.status} />
              </td>
              <td className="p-4 font-mono text-xs font-medium">{String(v.id).slice(0, 8)}…</td>
              <td className="p-4">
                <div className="font-medium">{v.reporterName || "—"}</div>
                <div className="text-xs text-slate-500">{v.reporterEmail || ""}</div>
              </td>
              <td className="p-4 capitalize">{v.category ?? "—"}</td>
              <td className="p-4 max-w-[220px]" title={v.description}>
                {truncate(v.description, 100)}
              </td>
              <td className="p-4">{v.location ?? "—"}</td>
              <td className="p-4 text-slate-700">{subjectSummary(v)}</td>
              <td className="p-4 capitalize">{v.evidence_media_type ?? "—"}</td>
              <td className="p-4 text-slate-500 whitespace-nowrap">{v.time ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {reviewRow && (
      <ManualViolationReviewModal
        row={reviewRow}
        canGiveRewards={canGiveRewards}
        onClose={() => setReviewRow(null)}
        onSaved={() => fetchRows(true)}
      />
    )}
    </>
  );
}
