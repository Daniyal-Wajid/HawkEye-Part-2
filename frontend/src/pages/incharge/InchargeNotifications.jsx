import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import { Bell, AlertCircle, CheckCircle, Info, Loader2, RefreshCw } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

function priorityIcon(priority) {
    const p = (priority || "").toUpperCase();
    if (p === "HIGH") return <AlertCircle className="w-5 h-5" />;
    if (p === "LOW")  return <CheckCircle  className="w-5 h-5" />;
    return <Info className="w-5 h-5" />;
}

function priorityColour(priority) {
    const p = (priority || "").toUpperCase();
    if (p === "HIGH") return "bg-red-100 text-red-600";
    if (p === "LOW")  return "bg-green-100 text-green-600";
    return "bg-blue-100 text-blue-600";
}

function priorityBadge(priority) {
    const p = (priority || "MED").toUpperCase();
    if (p === "HIGH") return "bg-red-100 text-red-700";
    if (p === "LOW")  return "bg-green-100 text-green-700";
    return "bg-blue-100 text-blue-700";
}

export default function InchargeNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchNotifications = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiGet("/api/notifications");
            setNotifications(data || []);
            setError("");
        } catch (err) {
            setError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const id = setInterval(() => fetchNotifications(true), 30000);
        return () => clearInterval(id);
    }, [fetchNotifications]);

    const markRead = async (id) => {
        try {
            await apiPatch(`/api/notifications/${id}`, { read: true });
            setNotifications((prev) =>
                prev.map((n) => (n._id === id || n.id === id ? { ...n, read: true } : n))
            );
        } catch (_) {}
    };

    const markAllRead = async () => {
        const unread = notifications.filter((n) => !n.read);
        await Promise.all(unread.map((n) => apiPatch(`/api/notifications/${n._id || n.id}`, { read: true })));
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <>
            <Topbar />
            <div className="p-6 max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Notifications</h1>
                        <p className="text-slate-500">
                            {loading ? "Loading…" : unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchNotifications()}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-sm text-blue-600 hover:underline px-2"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>
                </div>

                {/* Body */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
                        <AlertCircle className="shrink-0" />
                        <p>{error}</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                        <Bell className="w-12 h-12 opacity-20" />
                        <p className="text-sm">No notifications yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((n) => {
                            const id = n._id || n.id;
                            return (
                                <div
                                    key={id}
                                    className={`flex items-start gap-4 p-5 rounded-2xl border transition-colors ${
                                        !n.read ? "bg-blue-50/50 border-blue-100" : "bg-white border-slate-100"
                                    }`}
                                >
                                    {/* Icon */}
                                    <div className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${priorityColour(n.priority)}`}>
                                        {priorityIcon(n.priority)}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className={`font-semibold leading-snug ${!n.read ? "text-slate-900" : "text-slate-700"}`}>
                                                {n.title}
                                            </p>
                                            <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                                                {n.time || "—"}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 mt-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityBadge(n.priority)}`}>
                                                {(n.priority || "MED").toUpperCase()}
                                            </span>
                                            {!n.read && (
                                                <button
                                                    onClick={() => markRead(id)}
                                                    className="text-xs text-blue-600 hover:underline"
                                                >
                                                    Mark as read
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Unread dot */}
                                    {!n.read && (
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-2 shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
