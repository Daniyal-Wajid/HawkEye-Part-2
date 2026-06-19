export default function TimelineItem({ log }) {
  return (
    <div className="flex items-start gap-4 p-4 border rounded-xl hover:bg-slate-50">
      <div
        className={`w-10 h-10 flex items-center justify-center rounded-full
        ${
          log.color === "green"
            ? "bg-green-100"
            : log.color === "blue"
            ? "bg-blue-100"
            : "bg-purple-100"
        }`}
      >
        <span className="text-lg">{log.icon}</span>
      </div>

      <div className="flex-1">
        <p className="font-semibold">{log.action}</p>
        <p className="text-sm text-slate-500">
          by {log.user} • Related:{" "}
          <span className="font-mono">{log.relatedId}</span>
        </p>
        <p className="text-sm text-slate-400">{log.description}</p>
      </div>

      <p className="text-sm text-slate-400 whitespace-nowrap">
        {log.time}
      </p>
    </div>
  );
}
