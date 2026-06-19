import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../../components/Card";
import {
  Gift, Trophy, Loader2, AlertCircle, CheckCircle2,
  Search, X, RefreshCw, Trash2,
} from "lucide-react";
import { apiGet, apiPost } from "../../lib/api";

/* ── tiny avatar from initials ── */
function Avatar({ name }) {
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colours = [
    "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500",
    "bg-rose-500", "bg-orange-500", "bg-teal-500", "bg-emerald-500",
  ];
  const colour = colours[initials.charCodeAt(0) % colours.length];
  return (
    <div className={`w-10 h-10 rounded-full ${colour} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
      {initials}
    </div>
  );
}

function rankBadge(rank) {
  if (rank === 1) return "bg-yellow-400 text-yellow-900";
  if (rank === 2) return "bg-slate-300 text-slate-700";
  if (rank === 3) return "bg-orange-400 text-orange-900";
  return "bg-slate-100 text-slate-600";
}

function rankIcon(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function Rewards() {
  /* ── form state ── */
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [points, setPoints] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  /* ── leaderboard + recent rewards ── */
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentRewards, setRecentRewards] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState("");

  /* ── load data ── */
  const fetchBoard = useCallback(async (silent = false) => {
    if (!silent) setLoadingBoard(true);
    setBoardError("");
    try {
      const [lb, recent] = await Promise.all([
        apiGet("/api/rewards/leaderboard"),
        apiGet("/api/rewards"),
      ]);
      setLeaderboard(lb || []);
      setRecentRewards((recent || []).slice(0, 10));
    } catch (err) {
      setBoardError(err.message);
    } finally {
      if (!silent) setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const studs = await apiGet("/api/students");
        setStudents(studs || []);
      } catch (_) {}
    })();
    fetchBoard();
  }, [fetchBoard]);

  /* ── filtered student dropdown ── */
  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.roll_number || s.rollNumber || "").toLowerCase().includes(q) ||
      (s.department || "").toLowerCase().includes(q)
    );
  });

  const handleSelectStudent = (s) => {
    setSelectedStudent(s);
    setStudentSearch(s.name);
    setShowDropdown(false);
  };

  /* ── submit form ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!selectedStudent) { setFormError("Please select a student."); return; }
    if (!points || Number(points) <= 0) { setFormError("Points must be greater than 0."); return; }

    setSubmitting(true);
    try {
      await apiPost("/api/rewards", {
        studentId: selectedStudent._id || selectedStudent.id,
        points: Number(points),
        description: description.trim() || null,
      });
      setFormSuccess(`✓ ${points} points issued to ${selectedStudent.name}`);
      setSelectedStudent(null);
      setStudentSearch("");
      setPoints("");
      setDescription("");
      fetchBoard(true);
      setTimeout(() => setFormSuccess(""), 5000);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Rewards</h1>
          <p className="text-slate-500">Issue and manage student rewards</p>
        </div>
        <button
          onClick={() => fetchBoard()}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Issue Reward Form ── */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Gift className="w-5 h-5 text-blue-600" />
              Issue Reward
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Student picker */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Student
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setSelectedStudent(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search by name, roll number, department…"
                    className="w-full pl-9 pr-9 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      onClick={() => { setStudentSearch(""); setSelectedStudent(null); setShowDropdown(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showDropdown && studentSearch && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                      <p className="text-sm text-slate-400 p-4 text-center">No students found</p>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s._id || s.id}
                          type="button"
                          onClick={() => handleSelectStudent(s)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors"
                        >
                          <Avatar name={s.name} />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-500">
                              {s.roll_number || s.rollNumber || "—"} · {s.department || "—"}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedStudent && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <Avatar name={selectedStudent.name} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedStudent.name}</p>
                    <p className="text-xs text-slate-500">
                      {selectedStudent.roll_number || selectedStudent.rollNumber || "—"} · {selectedStudent.department || "—"}
                    </p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-blue-500 ml-auto shrink-0" />
                </div>
              )}

              {/* Points */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Points</label>
                <input
                  type="number"
                  min={1}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Outstanding attendance, good behaviour…"
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  rows={3}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors text-white py-2.5 rounded-xl flex items-center justify-center gap-2 font-medium"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Issuing…</>
                ) : (
                  <><Gift className="w-4 h-4" /> Issue Reward</>
                )}
              </button>
            </form>
          </CardContent>
        </Card>

        {/* ── Leaderboard ── */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Rewards Leaderboard
            </h2>

            {loadingBoard ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              </div>
            ) : boardError ? (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" /> {boardError}
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Trophy className="w-10 h-10 opacity-20" />
                <p className="text-sm">No rewards issued yet</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {leaderboard.map((s) => (
                  <div
                    key={s.studentId || s.name}
                    className="flex items-center gap-3 border border-slate-100 rounded-xl p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${rankBadge(s.rank)}`}
                    >
                      {rankIcon(s.rank)}
                    </div>
                    <Avatar name={s.name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 truncate">{s.department || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-blue-600">{s.points}</p>
                      <p className="text-xs text-slate-400">pts</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Rewards ── */}
      {recentRewards.length > 0 && (
        <Card className="mt-6">
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Recent Rewards</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr className="h-10">
                    <th className="px-4 font-medium">Student</th>
                    <th className="px-4 font-medium">Points</th>
                    <th className="px-4 font-medium">Reason</th>
                    <th className="px-4 font-medium">Issued By</th>
                    <th className="px-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentRewards.map((r) => (
                    <tr key={r._id || r.id} className="h-14 hover:bg-slate-50 transition-colors">
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.studentName} />
                          <div>
                            <p className="font-medium text-slate-800">{r.studentName}</p>
                            <p className="text-xs text-slate-400">{r.studentDepartment || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4">
                        <span className="font-bold text-blue-600">+{r.points}</span>
                      </td>
                      <td className="px-4 text-slate-500 max-w-xs truncate">{r.description || "—"}</td>
                      <td className="px-4 text-slate-500">{r.issuedBy || "—"}</td>
                      <td className="px-4 text-slate-400 whitespace-nowrap">{r.time || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
