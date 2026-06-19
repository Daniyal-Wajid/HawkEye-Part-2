import { useState, useEffect, useCallback } from "react";
import AnalyticsStatCard from "../../components/AnalyticsStatCard";
import ViolationsTrendChart from "../../components/ViolationsTrendChart";
import SeverityDonutChart from "../../components/SeverityDonutChart";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { apiGet } from "../../lib/api";

const POLL_INTERVAL = 30000;

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiGet("/api/analytics/summary");
      setSummary(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Analytics & Reports</h1>
          <p className="text-slate-500">View insights and generate reports</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSummary}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            <Download size={16} />
            Download Report
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-6">
            <AnalyticsStatCard
              label="Total Camera Violations"
              value={summary?.totalViolations ?? 0}
              icon="⚠️"
            />
            <AnalyticsStatCard
              label="Total Fines"
              value={`Rs. ${(summary?.totalFineAmount ?? 0).toLocaleString()}`}
              icon="💰"
            />
            <AnalyticsStatCard
              label="Collected"
              value={`Rs. ${(summary?.collectedAmount ?? 0).toLocaleString()}`}
              icon="📈"
            />
            <AnalyticsStatCard
              label="Pending"
              value={`Rs. ${(summary?.pendingAmount ?? 0).toLocaleString()}`}
              icon="📉"
            />
          </div>

          {/* Fines by type */}
          {summary?.finesByType?.length > 0 && (
            <div className="bg-white border rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">Fines by Violation Type</h2>
              <div className="flex flex-wrap gap-3">
                {summary.finesByType.map((item) => (
                  <div key={item.type} className="flex items-center gap-3 bg-slate-50 border rounded-lg px-4 py-3 min-w-[160px]">
                    <div>
                      <p className="text-xs text-slate-500 capitalize">{item.type}</p>
                      <p className="font-bold text-slate-800">{item.count} fine{item.count !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-blue-600 font-medium">Rs. {item.amount.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <ViolationsTrendChart data={summary?.violationsTrend ?? []} />
            <SeverityDonutChart data={summary?.severityDistribution ?? []} />
          </div>

          <p className="text-xs text-slate-400 text-right">
            Auto-refreshes every 30 seconds
          </p>
        </>
      )}
    </div>
  );
}
