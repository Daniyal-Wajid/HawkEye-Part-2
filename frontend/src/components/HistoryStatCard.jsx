export default function HistoryStatCard({ icon, label, value }) {
  return (
    <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
      <div className="text-2xl">{icon}</div>
      <div>
        <p className="text-slate-500 text-sm">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
