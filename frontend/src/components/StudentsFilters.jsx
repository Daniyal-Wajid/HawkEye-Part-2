import { Search } from "lucide-react";

export default function StudentsFilters() {
  return (
    <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-4">
      <div className="relative flex-1 min-w-[250px]">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <input
          placeholder="Search by name or ID..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      <select className="px-4 py-2 border rounded-lg text-sm bg-white">
        <option>All Departments</option>
      </select>

      <select className="px-4 py-2 border rounded-lg text-sm bg-white">
        <option>All Semesters</option>
      </select>
    </div>
  );
}
