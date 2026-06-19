import Topbar from "../../components/Topbar";
import ManualViolationsTable from "../../components/ManualViolationsTable";

export default function ManualViolations() {
  return (
    <>
      <Topbar />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Manual Violations</h1>
          <p className="text-slate-500">
            Reports submitted by students from the mobile app (not camera detections).
          </p>
        </div>
        <ManualViolationsTable />
      </div>
    </>
  );
}
