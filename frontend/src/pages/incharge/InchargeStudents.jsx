import { useState, useEffect, useMemo } from "react";
import Topbar from "../../components/Topbar";
import { Card, CardContent } from "../../components/Card";
import { Search, User, Loader2, AlertCircle } from "lucide-react";
import { apiGet } from "../../lib/api";

function Avatar({ name }) {
    const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const colours = [
        "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500",
        "bg-teal-500", "bg-orange-500", "bg-emerald-500", "bg-rose-500",
    ];
    const colour = colours[initials.charCodeAt(0) % colours.length];
    return (
        <div className={`w-10 h-10 rounded-full ${colour} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {initials}
        </div>
    );
}

export default function InchargeStudents() {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet("/api/students");
                setStudents(data || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

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

    return (
        <>
            <Topbar />
            <div className="p-6 space-y-6">
                {/* Header — no Add Student button */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Student Directory</h1>
                        <p className="text-slate-500">
                            {loading ? "Loading…" : `${students.length} registered student${students.length !== 1 ? "s" : ""}`}
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, roll number, department…"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
                        <AlertCircle className="shrink-0" />
                        <p>{error}</p>
                    </div>
                ) : (
                    <Card>
                        <CardContent>
                            {filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                                    <User className="w-10 h-10 opacity-30" />
                                    <p className="text-sm">
                                        {search ? `No students match "${search}"` : "No students registered yet."}
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="text-left text-slate-500 border-b bg-slate-50">
                                        <tr>
                                            <th className="p-4 font-medium">Student</th>
                                            <th className="p-4 font-medium">Roll Number</th>
                                            <th className="p-4 font-medium">Department</th>
                                            <th className="p-4 font-medium">Email</th>
                                            <th className="p-4 font-medium">Registered</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {filtered.map((s) => (
                                            <tr key={s._id || s.id} className="hover:bg-slate-50 transition">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={s.name} />
                                                        <span className="font-medium text-slate-900">{s.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-slate-600 font-mono text-xs">
                                                    {s.roll_number || s.rollNumber || "—"}
                                                </td>
                                                <td className="p-4 text-slate-600">{s.department || "—"}</td>
                                                <td className="p-4 text-slate-500">{s.email || "—"}</td>
                                                <td className="p-4 text-slate-400 whitespace-nowrap">
                                                    {s.created_at
                                                        ? new Date(s.created_at).toLocaleDateString()
                                                        : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}
