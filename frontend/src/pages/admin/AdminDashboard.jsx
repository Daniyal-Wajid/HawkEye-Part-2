import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import StatCard from "../../components/StatCard";
import ViolationsTable from "../../components/ViolationsTableFull";
import { AlertTriangle, Clock, Camera, Receipt } from "lucide-react";
import { apiGet } from "../../lib/api";

const POLL_INTERVAL = 30000;

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiGet("/api/analytics/summary");
      setSummary(data);
    } catch (err) {
      console.error("[Dashboard] Failed to load summary:", err.message);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500">Welcome back, Admin</p>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <StatCard
            title="Today's Camera Violations"
            value={summary ? String(summary.todayViolations) : "—"}
            icon={<AlertTriangle />}
            color="bg-blue-100 text-blue-600"
          />
          <StatCard
            title="Unverified (camera)"
            value={summary ? String(summary.unverifiedViolations) : "—"}
            icon={<Clock />}
            color="bg-orange-100 text-orange-600"
          />
          <StatCard
            title="High-severity (camera)"
            value={summary ? String(summary.highSeverityViolations) : "—"}
            icon={<AlertTriangle />}
            color="bg-red-100 text-red-600"
          />
          <StatCard
            title="Active Cameras"
            value={summary ? `${summary.activeCameras}/${summary.totalCameras}` : "—"}
            icon={<Camera />}
            color="bg-green-100 text-green-600"
          />
        </div>

        {summary && (
          <div className="grid grid-cols-4 gap-6">
            <StatCard
              title="Total Fines Issued"
              value={String(summary.totalFines)}
              icon={<Receipt />}
              color="bg-purple-100 text-purple-600"
            />
            <StatCard
              title="Pending Fine Amount"
              value={`Rs. ${(summary.pendingAmount || 0).toLocaleString()}`}
              icon={<Receipt />}
              color="bg-red-100 text-red-600"
            />
            <StatCard
              title="Collected Amount"
              value={`Rs. ${(summary.collectedAmount || 0).toLocaleString()}`}
              icon={<Receipt />}
              color="bg-green-100 text-green-600"
            />
            <StatCard
              title="Total Camera Violations"
              value={String(summary.totalViolations)}
              icon={<AlertTriangle />}
              color="bg-slate-100 text-slate-600"
            />
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Camera Violations</h2>
          <ViolationsTable />
        </div>
      </div>
    </>
  );
}
