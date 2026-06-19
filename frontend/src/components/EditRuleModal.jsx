import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { apiPatch } from "../lib/api";

const SEVERITIES = ["LOW", "MED", "HIGH"];

// Exact strings the YOLO AI model reports. Aliases are handled automatically server-side.
const VIOLATION_TYPE_HINTS = [
  { value: "gun",      label: "Gun (also matches: pistol, rifle, firearm, guns)" },
  { value: "pistol",   label: "Pistol — alias of gun group" },
  { value: "rifle",    label: "Rifle — alias of gun group" },
  { value: "firearm",  label: "Firearm — alias of gun group" },
  { value: "knife",    label: "Knife (also matches: blade, knives)" },
  { value: "blade",    label: "Blade — alias of knife group" },
  { value: "weapon",   label: "Weapon (generic — exact match only)" },
  { value: "fighting", label: "Fighting" },
  { value: "smoking",  label: "Smoking" },
  { value: "uniform",  label: "Uniform Violation" },
];

export default function EditRuleModal({ rule, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [violationType, setViolationType] = useState("");
  const [severity, setSeverity] = useState("MED");
  const [penalty, setPenalty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (rule) {
      setTitle(rule.title ?? "");
      setViolationType(rule.violation_type ?? "");
      setSeverity(rule.severity ?? "MED");
      setPenalty(rule.penalty ?? 0);
      setError("");
    }
  }, [rule]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rule) return;
    setSaving(true);
    setError("");
    try {
      await apiPatch(`/api/policy-rules/${rule._id || rule.id}`, {
        title,
        violation_type: violationType.trim().toLowerCase() || null,
        severity,
        penalty,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!rule) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Edit Rule</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Gun Detected"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Violation Type Key
              <span className="ml-1 text-xs text-slate-400">(used for AI matching)</span>
            </label>
            <input
              type="text"
              value={violationType}
              onChange={(e) => setViolationType(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. gun, knife, fighting"
              list="violation-type-hints"
            />
            <datalist id="violation-type-hints">
              {VIOLATION_TYPE_HINTS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-400">
              AI detects: <span className="font-mono">gun · pistol · rifle · knife · blade · weapon</span>.
              Aliases are grouped automatically (gun = pistol = rifle). Leave blank to make this rule a
              <strong className="text-slate-500"> catch-all</strong> that fires on any unmatched violation.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Penalty (Rs.)</label>
            <input
              type="number"
              min={0}
              value={penalty}
              onChange={(e) => setPenalty(Number(e.target.value) || 0)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-lg py-2.5 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
            >
              {saving ? <><Loader2 className="animate-spin" size={18} /> Saving...</> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
