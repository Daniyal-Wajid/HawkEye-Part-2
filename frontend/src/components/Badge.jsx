export default function Badge({ text, variant }) {
  const styles = {
    MED: "bg-blue-100 text-blue-600",
    HIGH: "bg-red-100 text-red-600",
    Unverified: "bg-orange-100 text-orange-600",
    Rejected: "bg-red-100 text-red-600",
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-700",
  };

  const cls = styles[variant] || "bg-slate-100 text-slate-600";

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {text}
    </span>
  );
}
