import { useState, useEffect } from "react";
import { Bell, Loader2, AlertCircle } from "lucide-react";
import PriorityBadge from "./PriorityBadge";
import { apiGet, apiPatch } from "../lib/api";

export default function NotificationsList() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchNotifications = async () => {
    try {
      const data = await apiGet("/api/notifications");
      setNotifications(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markRead = async (id) => {
    try {
      await apiPatch(`/api/notifications/${id}`, { read: true });
      setNotifications((prev) => prev.map((n) => (n._id === id || n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      console.error("Mark read failed", e);
    }
  };

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
    <div className="bg-white border rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold">All Notifications</h2>

      {notifications.length === 0 ? (
        <p className="text-slate-500 py-4">No notifications yet.</p>
      ) : (
        notifications.map((n) => (
          <div
            key={n._id || n.id}
            className={`flex items-center justify-between border rounded-lg p-4 ${!n.read ? "bg-slate-50" : ""}`}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-100 text-red-600">
                <Bell />
              </div>

              <div>
                <p className="font-medium">{n.title}</p>
                {n.violationId && (
                  <p className="text-sm text-slate-500">Violation ID: {n.violationId}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <PriorityBadge level={n.priority} />
              <span className="text-sm text-slate-500">{n.time ?? "-"}</span>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markRead(n._id || n.id)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
