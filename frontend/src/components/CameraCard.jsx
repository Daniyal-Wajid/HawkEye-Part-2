import { Camera, Pencil, Power, Trash2 } from "lucide-react";

export default function CameraCard({ camera, onEdit, onToggleStatus, onDelete }) {
  const isActive = (camera.status || "").toLowerCase() === "active";

  return (
    <div className="bg-white border rounded-xl overflow-hidden flex flex-col">
      <div className="relative bg-slate-100 h-40 flex items-center justify-center">
        <Camera size={48} className="text-slate-300" />

        <span
          className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold
            ${isActive ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}
        >
          {camera.status || (isActive ? "Active" : "Offline")}
        </span>

        <span className="absolute bottom-3 left-3 bg-slate-700 text-white text-xs px-2 py-1 rounded font-mono truncate max-w-[140px]">
          {camera.id}
        </span>
      </div>

      <div className="p-4 space-y-2 flex-1">
        <h3 className="font-semibold">{camera.name}</h3>
        <p className="text-sm text-blue-600 break-all">
          {camera.stream || "—"}
        </p>
      </div>

      <div className="px-4 pb-4 pt-2 flex flex-wrap gap-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onEdit?.(camera)}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-blue-600 hover:bg-blue-50 rounded-lg py-2 text-sm font-medium"
        >
          <Pencil size={14} /> Edit
        </button>
        <button
          type="button"
          onClick={() => onToggleStatus?.(camera)}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium border
            ${isActive ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
        >
          <Power size={14} />
          {isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(camera)}
          className="flex items-center justify-center gap-1.5 text-red-600 hover:bg-red-50 rounded-lg px-3 py-2"
          title="Delete camera"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
