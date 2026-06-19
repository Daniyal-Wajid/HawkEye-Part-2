export default function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-white rounded-xl border p-6 flex justify-between items-center">
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        {icon}
      </div>
    </div>
  );
}
