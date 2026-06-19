import { useState, useEffect } from "react";
import { apiGet } from "../../lib/api";
import HistoryStatCard from "../../components/HistoryStatCard";
import TimelineItem from "../../components/TimelineItem";
import { Loader2, AlertCircle } from "lucide-react";

export default function HistoryLogs() {
  const [summary, setSummary] = useState({ totalLogs: 0, todayActivity: 0, activeUsers: 0 });
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryData, logsData] = await Promise.all([
          apiGet("/api/history-summary"),
          apiGet("/api/activity-logs"),
        ]);
        setSummary(summaryData);
        setActivityLogs(logsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">History Logs</h1>
        <p className="text-slate-500">View all system activity logs</p>
      </div>

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search logs..."
          className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select className="border rounded-lg px-4 py-2">
          <option>All Actions</option>
          <option>Camera Violations</option>
          <option>Payments</option>
          <option>Authentication</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <HistoryStatCard label="Total Logs" value={summary.totalLogs} icon="🕒" />
        <HistoryStatCard label="Today's Activity" value={summary.todayActivity} icon="⏰" />
        <HistoryStatCard label="Active Users" value={summary.activeUsers} icon="👤" />
      </div>

      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Activity Timeline</h2>

        <div className="space-y-4">
          {activityLogs.length === 0 ? (
            <p className="text-slate-500">No activity logs yet.</p>
          ) : (
            activityLogs.map((log) => (
              <TimelineItem
                key={log._id || log.id}
                log={{
                  id: log._id || log.id,
                  action: log.action,
                  user: log.user ?? log.userName ?? "—",
                  relatedId: log.relatedId ?? "—",
                  description: log.description ?? "",
                  time: log.time ?? "—",
                  icon: log.icon ?? "📄",
                  color: log.color ?? "green",
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
