import { Bell, AlertTriangle, Check } from "lucide-react";

export default function NotificationStats() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 rounded-full bg-blue-100 text-blue-600">
          <Bell />
        </div>
        <div>
          <p className="text-sm text-slate-500">Total Alerts</p>
          <p className="text-2xl font-bold">15</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 rounded-full bg-red-100 text-red-600">
          <AlertTriangle />
        </div>
        <div>
          <p className="text-sm text-slate-500">High Priority</p>
          <p className="text-2xl font-bold">8</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 rounded-full bg-green-100 text-green-600">
          <Check />
        </div>
        <div>
          <p className="text-sm text-slate-500">Read</p>
          <p className="text-2xl font-bold">9</p>
        </div>
      </div>
    </div>
  );
}
