import { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Loader2, UserCheck, Receipt, Search, CheckCircle2,
  ShieldAlert, Video, AlertCircle, GraduationCap, BookOpen,
} from "lucide-react";
import { apiGet, apiPatch } from "../lib/api";

/* ── tiny avatar using student initials ── */
function Avatar({ name, size = "md" }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const colours = [
    "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500",
    "bg-rose-500", "bg-orange-500", "bg-teal-500", "bg-cyan-500",
  ];
  const colour = colours[initials.charCodeAt(0) % colours.length];
  const sz = size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} ${colour} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

export default function ApproveViolationModal({ violation, onClose, onDone }) {
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [policyRules, setPolicyRules] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedRule, setSelectedRule] = useState(null); // manually chosen policy rule
  const [applyFine, setApplyFine] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  /* load students + policy rules in parallel */
  useEffect(() => {
    (async () => {
      try {
        const [studs, rules] = await Promise.all([
          apiGet("/api/students"),
          apiGet("/api/policy-rules"),
        ]);
        setStudents(studs);
        setPolicyRules(rules);
        // Pre-select the matching rule (by violation_type), but user can change it
        const auto = rules.find(
          (r) => r.violation_type &&
            violation?.type &&
            r.violation_type.toLowerCase() === violation.type.toLowerCase()
        );
        setSelectedRule(auto || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingStudents(false);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
    })();
  }, [violation?.type]);

  /* keyboard: Escape to close */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* filtered student list */

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.roll_number || s.rollNumber || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [students, search]);

  const handleApprove = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiPatch(
        `/api/review-queue/${violation._id || violation.id}/approve`,
        {
          studentId: selectedStudent ? (selectedStudent._id || selectedStudent.id) : null,
          applyFine: applyFine && !!selectedStudent && !!selectedRule,
          policyRuleId: selectedRule ? (selectedRule._id || selectedRule.id) : null,
        }
      );
      onDone?.(result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!violation) return null;

  const hasClip = !!violation.clipUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Review & Approve Violation</h2>
              <p className="text-xs text-slate-500">
                Watch the recording, identify the student, then approve or dismiss
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

        {/* ── Body: two columns ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── LEFT: Violation details + video ── */}
          <div className="w-[42%] border-r flex flex-col overflow-y-auto bg-slate-50">
            {/* Video player */}
            <div className="bg-black aspect-video shrink-0 flex items-center justify-center">
              {hasClip ? (
                <video
                  key={violation.clipUrl}
                  controls
                  autoPlay
                  muted
                  loop
                  className="w-full h-full object-contain"
                >
                  <source src={violation.clipUrl} type="video/mp4" />
                  <source src={violation.clipUrl} type="video/webm" />
                </video>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500 p-6 text-center">
                  <Video className="w-10 h-10 opacity-30" />
                  <p className="text-xs text-slate-400">No recording captured</p>
                </div>
              )}
            </div>

            {/* Violation meta */}
            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2.5 text-sm">
                <h3 className="font-semibold text-red-700 flex items-center gap-1.5 mb-3">
                  <AlertCircle size={14} /> Violation Summary
                </h3>
                {[
                  ["Type", <span className="capitalize font-semibold text-red-700">{violation.type}</span>],
                  ["Severity", violation.severity || "HIGH"],
                  ["Confidence", violation.confidence || "—"],
                  ["Location", violation.location || "—"],
                  ["Detected At", violation.time || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span className="text-slate-500 shrink-0">{label}</span>
                    <span className="font-medium text-slate-800 text-right">{value}</span>
                  </div>
                ))}
              </div>

              {/* Policy rules — always visible so incharge can pick one */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <BookOpen size={13} />
                  Policy Rules — Select Fine
                </p>
                {policyRules.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No policy rules defined yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {/* "No fine" option */}
                    <button
                      onClick={() => setSelectedRule(null)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                        !selectedRule
                          ? "bg-slate-100 border-slate-400 ring-1 ring-slate-300"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                        <X size={13} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-600">No fine</p>
                        <p className="text-xs text-slate-400">Approve without a penalty</p>
                      </div>
                      {!selectedRule && <CheckCircle2 size={15} className="text-slate-400 ml-auto shrink-0" />}
                    </button>

                    {policyRules.map((r) => {
                      const rid = r._id || r.id;
                      const isSelected = selectedRule && (selectedRule._id || selectedRule.id) === rid;
                      return (
                        <button
                          key={rid}
                          onClick={() => setSelectedRule(r)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                            isSelected
                              ? "bg-amber-50 border-amber-400 ring-1 ring-amber-200"
                              : "bg-white border-slate-200 hover:bg-amber-50/40 hover:border-amber-200"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                            <Receipt size={13} className="text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{r.title}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {r.violation_type ? `Type: ${r.violation_type}` : "All violations"} · Rs. {Number(r.penalty || 0).toLocaleString()}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 size={15} className="text-amber-500 shrink-0 ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fine checkbox — only shown if student AND rule selected */}
              {selectedStudent && selectedRule && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyFine}
                      onChange={(e) => setApplyFine(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 accent-blue-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <Receipt size={13} className="text-amber-600" />
                        Apply fine to {selectedStudent.name}
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Rs. <span className="font-bold">{Number(selectedRule.penalty || 0).toLocaleString()}</span>
                        {" "}— {selectedRule.title}
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Student roster ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search bar */}
            <div className="px-5 pt-4 pb-3 border-b bg-white shrink-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap size={13} />
                Identify the Student
              </p>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, roll number, department…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {selectedStudent && (
                <p className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  Selected: {selectedStudent.name}
                </p>
              )}
            </div>

            {/* Student list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingStudents ? (
                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Loading students…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                  <Search size={28} className="opacity-30" />
                  <p className="text-sm">No students match "{search}"</p>
                </div>
              ) : (
                <>
                  {/* "Keep unknown" option */}
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      !selectedStudent
                        ? "bg-slate-100 border-slate-400 ring-2 ring-slate-300"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                      <UserCheck size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-600">Keep as Unknown</p>
                      <p className="text-xs text-slate-400">Approve without linking to a student</p>
                    </div>
                    {!selectedStudent && (
                      <CheckCircle2 size={18} className="text-slate-500 shrink-0" />
                    )}
                  </button>

                  {filtered.map((s) => {
                    const sid = s._id || s.id;
                    const isSelected = selectedStudent && (selectedStudent._id || selectedStudent.id) === sid;
                    return (
                      <button
                        key={sid}
                        onClick={() => setSelectedStudent(s)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-blue-50 border-blue-400 ring-2 ring-blue-200"
                            : "bg-white border-slate-200 hover:bg-blue-50/50 hover:border-blue-200"
                        }`}
                      >
                        <Avatar name={s.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {s.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {s.roll_number || s.rollNumber || "—"} ·{" "}
                            {s.department || s.email || "—"}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={18} className="text-blue-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t bg-white shrink-0 flex items-center justify-between gap-4">
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          {!error && (
            <p className="text-xs text-slate-400">
              {selectedStudent
                ? `Approving as: ${selectedStudent.name}${applyFine && selectedRule ? ` · Fine: Rs. ${Number(selectedRule.penalty || 0).toLocaleString()}` : " · No fine"}`
                : "No student selected — violation will be marked as Unknown"}
            </p>
          )}
          <div className="flex gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border rounded-xl text-sm hover:bg-slate-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={saving}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 font-semibold transition-colors"
            >
              {saving ? (
                <><Loader2 className="animate-spin" size={16} /> Processing…</>
              ) : (
                <><CheckCircle2 size={16} /> Approve & Verify</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
