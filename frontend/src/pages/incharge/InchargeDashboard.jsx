import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import StatCard from "../../components/StatCard";
import ViolationsTable from "../../components/ViolationsTableFull";
import { AlertTriangle, Clock, ShieldAlert, CheckCircle, Receipt } from "lucide-react";
import { apiGet } from "../../lib/api";

const POLL_INTERVAL = 30000;

export default function InchargeDashboard() {
  const [summary, setSummary] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiGet("/api/analytics/summary");
      setSummary(data);
    } catch (err) {
      console.error("[InchargeDashboard] Failed to load summary:", err.message);
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
          <p className="text-slate-500">Overview of recent activity and alerts</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title="Unverified Camera Violations"
            value={summary ? String(summary.unverifiedViolations) : "—"}
            icon={<Clock />}
            color="bg-orange-100 text-orange-600"
          />
          <StatCard
            title="Total Camera Violations"
            value={summary ? String(summary.totalViolations) : "—"}
            icon={<ShieldAlert />}
            color="bg-red-100 text-red-600"
          />
          <StatCard
            title="Today's Camera Violations"
            value={summary ? String(summary.todayViolations) : "—"}
            icon={<CheckCircle />}
            color="bg-green-100 text-green-600"
          />
          <StatCard
            title="High-severity (camera)"
            value={summary ? String(summary.highSeverityViolations) : "—"}
            icon={<AlertTriangle />}
            color="bg-yellow-100 text-yellow-600"
          />
        </div>

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Pending Fines"
              value={String(summary.pendingFines)}
              icon={<Receipt />}
              color="bg-red-100 text-red-600"
            />
            <StatCard
              title="Pending Amount"
              value={`Rs. ${(summary.pendingAmount || 0).toLocaleString()}`}
              icon={<Receipt />}
              color="bg-orange-100 text-orange-600"
            />
            <StatCard
              title="Collected Amount"
              value={`Rs. ${(summary.collectedAmount || 0).toLocaleString()}`}
              icon={<Receipt />}
              color="bg-green-100 text-green-600"
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
