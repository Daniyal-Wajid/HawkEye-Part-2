export default function RoleBadge({ role }) {
  const r = (role || "").toLowerCase();
  const styles = {
    admin: "bg-red-100 text-red-600",
    discipline_incharge: "bg-blue-100 text-blue-600",
    student: "bg-slate-100 text-slate-600",
  };
  const label = role === "admin" ? "Admin" : role === "discipline_incharge" ? "Discipline Incharge" : role === "student" ? "Student" : (role || "—");

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[r] || "bg-slate-100 text-slate-600"}`}>
      {label}
    </span>
  );
}
