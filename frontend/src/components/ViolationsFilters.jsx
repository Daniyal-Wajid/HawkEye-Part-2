import { Search } from "lucide-react";

export default function ViolationsFilters() {
  return (
    <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-4">
      <div className="relative flex-1 min-w-[250px]">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <input
          placeholder="Search by ID, student, location..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      {["All Types", "All Severity", "All Status", "All Cameras"].map(
        (label) => (
          <select
            key={label}
            className="px-4 py-2 border rounded-lg text-sm bg-white"
          >
            <option>{label}</option>
          </select>
        )
      )}
    </div>
  );
}
