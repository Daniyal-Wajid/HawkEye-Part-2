import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import CameraStats from "../../components/CameraStats";
import CamerasGrid from "../../components/CamerasGrid";
import LiveRecognitionPanel from "../../components/LiveRecognitionPanel";
import AddCameraModal from "../../components/AddCameraModal";
import { Maximize2, Camera } from "lucide-react";
import { apiGet, apiPatch, apiDelete } from "../../lib/api";

export default function Cameras() {
  const [showLivePanel, setShowLivePanel] = useState(false);
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet("/api/cameras");
      setCameras(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const totalCameras = cameras.length;
  const active = cameras.filter((c) => (c.status || "").toLowerCase() === "active").length;
  const offline = totalCameras - active;

  const handleToggleStatus = useCallback(async (cam) => {
    const id = cam._id || cam.id;
    const isActive = (cam.status || "").toLowerCase() === "active";
    const nextStatus = isActive ? "Offline" : "Active";
    try {
      await apiPatch(`/api/cameras/${id}`, { status: nextStatus });
      await fetchCameras();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchCameras]);

  const handleDeleteCamera = useCallback(async (cam) => {
    const name = cam.name || cam.id;
    if (!window.confirm(`Delete camera "${name}"? This cannot be undone.`)) return;
    const id = cam._id || cam.id;
    try {
      await apiDelete(`/api/cameras/${id}`);
      await fetchCameras();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchCameras]);

  const handleEditCamera = useCallback(async (cam) => {
    const id = cam._id || cam.id;
    const newName = window.prompt("Camera name", cam.name || "") ?? cam.name;
    if (newName == null) return;
    const newStream = window.prompt("Stream URL", cam.stream || "") ?? cam.stream;
    if (newStream == null) return;
    try {
      await apiPatch(`/api/cameras/${id}`, { name: newName.trim(), stream: newStream.trim() });
      await fetchCameras();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchCameras]);

  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Cameras Management</h1>
            <p className="text-slate-500">Manage surveillance and AI detection</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setShowLivePanel(!showLivePanel)}
              className="flex items-center gap-2 bg-slate-100 text-slate-800 px-5 py-2.5 rounded-xl font-bold hover:bg-blue-600 hover:text-white transition-all shadow-lg shadow-slate-200"
            >
              <Maximize2 size={18} />
              {showLivePanel ? "Close AI View" : "Open AI Detection"}
            </button>
            <button
              type="button"
              onClick={() => setAddCameraOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Camera size={18} />
              Add IP Camera
            </button>
          </div>
        </div>

        {showLivePanel && (
          <div className="h-[600px] animate-in zoom-in-95 duration-300">
            <LiveRecognitionPanel cameras={cameras} onClose={() => setShowLivePanel(false)} />
          </div>
        )}

        <CameraStats
          totalCameras={totalCameras}
          active={active}
          offline={offline}
          loading={loading}
        />
        <CamerasGrid
          cameras={cameras}
          loading={loading}
          error={error}
          fetchCameras={fetchCameras}
          onEdit={handleEditCamera}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDeleteCamera}
        />

        {addCameraOpen && (
          <AddCameraModal
            onClose={() => setAddCameraOpen(false)}
            onSaved={() => { fetchCameras(); setAddCameraOpen(false); }}
          />
        )}
      </div>
    </>
  );
}
