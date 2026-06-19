import { Users, Shield, UserCheck } from "lucide-react";

export default function UserStats({ totalUsers = 0, admins = 0, disciplineIncharge = 0, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border rounded-xl p-6 flex items-center gap-4 animate-pulse">
            <div className="p-3 bg-slate-200 rounded-full h-12 w-12" />
            <div>
              <p className="text-sm text-slate-400 h-4 w-24 rounded bg-slate-100" />
              <p className="text-2xl font-bold h-8 w-12 mt-2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
          <Users />
        </div>
        <div>
          <p className="text-sm text-slate-500">Total Users</p>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-red-100 text-red-600 rounded-full">
          <Shield />
        </div>
        <div>
          <p className="text-sm text-slate-500">Admins</p>
          <p className="text-2xl font-bold">{admins}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-green-100 text-green-600 rounded-full">
          <UserCheck />
        </div>
        <div>
          <p className="text-sm text-slate-500">Discipline Incharge</p>
          <p className="text-2xl font-bold">{disciplineIncharge}</p>
        </div>
      </div>
    </div>
  );
}
