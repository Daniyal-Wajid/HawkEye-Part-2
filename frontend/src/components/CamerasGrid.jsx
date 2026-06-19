import { Loader2, AlertCircle } from "lucide-react";
import CameraCard from "./CameraCard";

export default function CamerasGrid({ cameras = [], loading, error, fetchCameras, onEdit, onToggleStatus, onDelete }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
        <AlertCircle className="shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {cameras.map((cam) => (
        <CameraCard
          key={cam._id || cam.id}
          camera={{ ...cam, id: cam._id || cam.id }}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
