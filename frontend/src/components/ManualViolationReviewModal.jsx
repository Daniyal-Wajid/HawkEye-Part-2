import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { apiPatch } from "../lib/api";

export default function ManualViolationReviewModal({ row, canGiveRewards, onClose, onSaved }) {
  const [status, setStatus] = useState(row?.status === "pending" ? "approved" : row?.status || "pending");
  const [reviewNote, setReviewNote] = useState(row?.reviewNote || row?.review_note || "");
  const [rewardPoints, setRewardPoints] = useState("");
  const [rewardDescription, setRewardDescription] = useState("");
  const subjectSap = String(row?.subject_sap_id ?? "").trim();
  const canFineSubject = subjectSap.length > 0;
  const [issueFine, setIssueFine] = useState(false);
  const [fineAmount, setFineAmount] = useState("");
  const [fineTarget, setFineTarget] = useState(canFineSubject ? "subject" : "reporter");
  const [fineReason, setFineReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "pending") setIssueFine(false);
  }, [status]);

  useEffect(() => {
    if (!canFineSubject && fineTarget === "subject") setFineTarget("reporter");
  }, [canFineSubject, fineTarget]);

  const submit = async (nextStatus) => {
    setSaving(true);
    setError("");
    try {
      if (nextStatus !== "pending" && issueFine) {
        if (!fineAmount.trim() || Math.floor(Number(fineAmount) || 0) <= 0) {
          setError("Enter a positive fine amount, or turn off “Issue fine”.");
          setSaving(false);
          return;
        }
        if (fineTarget === "subject" && !canFineSubject) {
          setError("Subject fine requires SAP / roll on the report.");
          setSaving(false);
          return;
        }
      }
      const pts = canGiveRewards && nextStatus === "approved" ? Number(rewardPoints) || 0 : 0;
      const body = {
        status: nextStatus,
        reviewNote: reviewNote.trim() || null,
      };
      if (canGiveRewards && nextStatus === "approved" && pts > 0) {
        body.rewardPoints = pts;
        body.rewardDescription = rewardDescription.trim() || null;
      }
      const canIssueFine = nextStatus !== "pending" && issueFine;
      if (canIssueFine) {
        body.issueFine = true;
        body.fineAmount = Math.floor(Number(fineAmount) || 0);
        body.fineTarget = fineTarget === "subject" ? "subject" : "reporter";
        body.fineReason = fineReason.trim() || null;
      }
      await apiPatch(`/api/manual-violations/${row.id}`, body);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Review report</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <p>
            <span className="text-slate-500">Reporter:</span>{" "}
            <span className="font-medium">{row.reporterName || "—"}</span>{" "}
            <span className="text-slate-400">{row.reporterEmail}</span>
          </p>
          <p>
            <span className="text-slate-500">Category:</span>{" "}
            <span className="capitalize">{row.category}</span>
          </p>
          <p className="text-slate-700 whitespace-pre-wrap">{row.description}</p>
          {row.evidenceSignedUrl && (
            <a
              href={row.evidenceSignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 font-medium hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Open evidence file
            </a>
          )}
        </div>

        <div className="p-4 border-t space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Decision</label>
            <div className="flex flex-wrap gap-2">
              {["pending", "approved", "rejected"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium capitalize border ${
                    status === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Note to student (optional)</label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Shown in student app history / staff logs…"
            />
          </div>

          {status !== "pending" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={issueFine}
                  onChange={(e) => setIssueFine(e.target.checked)}
                  className="mt-1 rounded border-slate-300"
                />
                <span className="text-xs font-semibold text-rose-900 leading-snug">
                  Issue fine (optional)
                  <span className="block font-normal text-rose-800/90 mt-0.5">
                    Fine the reporter or the named subject. Subject requires a SAP / roll on this report.
                  </span>
                </span>
              </label>
              {issueFine && (
                <div className="space-y-2 pl-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-rose-900/80 mb-1">Amount (Rs)</label>
                    <input
                      type="number"
                      min={1}
                      value={fineAmount}
                      onChange={(e) => setFineAmount(e.target.value)}
                      className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm bg-white"
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-rose-900/80 mb-1">Who is fined</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFineTarget("reporter")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          fineTarget === "reporter"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        Reporter
                      </button>
                      <button
                        type="button"
                        disabled={!canFineSubject}
                        onClick={() => setFineTarget("subject")}
                        title={!canFineSubject ? "Add subject SAP / roll on the report to fine the subject" : ""}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          fineTarget === "subject"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-white text-slate-600 border-slate-200"
                        } ${!canFineSubject ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        Subject ({subjectSap || "—"})
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-rose-900/80 mb-1">Reason on fine (optional)</label>
                    <input
                      type="text"
                      value={fineReason}
                      onChange={(e) => setFineReason(e.target.value)}
                      className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm bg-white"
                      placeholder="Shown to the student on the fine"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {canGiveRewards && status === "approved" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">Reward reporter (optional)</p>
              <input
                type="number"
                min={0}
                value={rewardPoints}
                onChange={(e) => setRewardPoints(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Points (0 = no reward)"
              />
              <input
                type="text"
                value={rewardDescription}
                onChange={(e) => setRewardDescription(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Reward description (optional)"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border text-sm font-medium">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(status)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save decision
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
