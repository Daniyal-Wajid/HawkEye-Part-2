import { Eye, User, Pencil } from "lucide-react";

export default function StudentCard({ student, onViewDetails, onEdit }) {
  const id = student._id || student.id;

  return (
    <div className="bg-white border rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-4">
        {student.avatar ? (
          <img
            src={student.avatar}
            alt={student.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <User className="text-slate-400" />
          </div>
        )}

        <div>
          <div className="font-bold text-slate-800">{student.name}</div>
          <div className="text-sm font-semibold text-blue-600">{student.rollNumber}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Registered ID
        </div>
        <div className="text-xs font-mono text-slate-500">
          {String(id).slice(-8).toUpperCase()}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => onViewDetails?.(student)}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-xl py-3 text-sm font-bold transition-all active:scale-[0.98]"
        >
          <Eye size={16} /> View Details
        </button>
        <button
          type="button"
          onClick={() => onEdit?.(student)}
          className="flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl px-4 py-3 text-sm font-bold transition-all"
        >
          <Pencil size={16} /> Edit
        </button>
      </div>
    </div>
  );
}
