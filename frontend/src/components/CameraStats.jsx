import { Camera, Circle } from "lucide-react";

export default function CameraStats({ totalCameras = 0, active = 0, offline = 0, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-6">
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
    <div className="grid grid-cols-3 gap-6">
      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
          <Camera />
        </div>
        <div>
          <p className="text-sm text-slate-500">Total Cameras</p>
          <p className="text-2xl font-bold">{totalCameras}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-green-100 text-green-600 rounded-full">
          <Circle size={16} fill="currentColor" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Active</p>
          <p className="text-2xl font-bold">{active}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 flex items-center gap-4">
        <div className="p-3 bg-slate-200 text-slate-500 rounded-full">
          <Circle size={16} fill="currentColor" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Offline</p>
          <p className="text-2xl font-bold">{offline}</p>
        </div>
      </div>
    </div>
  );
}
