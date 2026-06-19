import { Pencil, Trash2 } from "lucide-react";
import SeverityBadge from "./SeverityBadge";

export default function PolicyRuleCard({ rule, onEdit, onDelete }) {
  const handleDelete = () => {
    if (window.confirm(`Delete rule "${rule.title}"? This cannot be undone.`)) {
      onDelete?.(rule);
    }
  };

  return (
    <div className="bg-white border rounded-xl p-6 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">{rule.title}</h3>
          <SeverityBadge level={rule.severity} />
        </div>

        {rule.violation_type && (
          <div className="text-sm text-slate-500 flex justify-between">
            <span>Violation Type</span>
            <span className="font-medium text-slate-700 uppercase tracking-wide text-xs bg-slate-100 px-2 py-0.5 rounded">
              {rule.violation_type}
            </span>
          </div>
        )}

        <div className="text-sm text-slate-500 flex justify-between">
          <span>Penalty Amount</span>
          <span className="text-blue-600 font-bold">
            Rs. {rule.penalty}
          </span>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => onEdit?.(rule)}
          className="flex-1 flex items-center justify-center gap-2 border rounded-lg py-2 hover:bg-slate-50"
        >
          <Pencil size={16} />
          Edit Rule
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 border border-red-200 rounded-lg py-2 px-4 hover:bg-red-50 text-red-600"
          title="Delete rule"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
