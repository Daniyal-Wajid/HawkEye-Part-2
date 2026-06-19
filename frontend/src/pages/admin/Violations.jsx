import Topbar from "../../components/Topbar";
import ViolationsFilters from "../../components/ViolationsFilters";
import ViolationsTableFull from "../../components/ViolationsTableFull";

export default function Violations() {
  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Camera Violations</h1>
          <p className="text-slate-500">
            Manage and review violations detected from campus cameras
          </p>
        </div>

        <ViolationsFilters />
        <ViolationsTableFull />
      </div>
    </>
  );
}
