import { X, User, Mail, Hash, Building2, Calendar } from "lucide-react";

export default function ViewStudentModal({ student, onClose, onEdit }) {
  if (!student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Student Details</h2>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => { onClose(); onEdit(student); }}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
              <User className="text-slate-500" size={24} />
            </div>
            <div>
              <p className="font-semibold text-slate-800">{student.name ?? "—"}</p>
              <p className="text-sm text-slate-500 font-mono">{student._id || student.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-700">
            <Hash size={18} className="text-slate-400" />
            <span className="text-sm text-slate-500 w-24">Roll No.</span>
            <span className="font-medium">{student.rollNumber ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-700">
            <Mail size={18} className="text-slate-400" />
            <span className="text-sm text-slate-500 w-24">Email</span>
            <span className="font-medium break-all">{student.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-700">
            <Building2 size={18} className="text-slate-400" />
            <span className="text-sm text-slate-500 w-24">Department</span>
            <span className="font-medium">{student.department ?? "—"}</span>
          </div>
          {student.created_at && (
            <div className="flex items-center gap-3 text-slate-700">
              <Calendar size={18} className="text-slate-400" />
              <span className="text-sm text-slate-500 w-24">Registered</span>
              <span className="font-medium">{new Date(student.created_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-slate-50 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
