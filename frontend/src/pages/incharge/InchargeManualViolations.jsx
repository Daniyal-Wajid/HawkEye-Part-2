import Topbar from "../../components/Topbar";
import ManualViolationsTable from "../../components/ManualViolationsTable";

export default function InchargeManualViolations() {
  return (
    <>
      <Topbar />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Manual Violations</h1>
          <p className="text-slate-500">
            Student-submitted reports from the mobile app for your review.
          </p>
        </div>
        <ManualViolationsTable />
      </div>
    </>
  );
}
