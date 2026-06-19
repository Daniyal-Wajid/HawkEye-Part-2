import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import StudentsFilters from "../../components/StudentsFilters";
import StudentsGrid from "../../components/StudentsGrid";
import StudentRegistrationModal from "../../components/StudentRegistrationModal";
import ViewStudentModal from "../../components/ViewStudentModal";
import EditStudentModal from "../../components/EditStudentModal";
import { UserPlus } from "lucide-react";
import { apiGet } from "../../lib/api";

export default function Students() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewStudent, setViewStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet("/api/students");
      setStudents(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Students</h1>
            <p className="text-slate-500">View and manage student records</p>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            <UserPlus size={18} />
            Register Student
          </button>
        </div>

        <StudentsFilters />
        <StudentsGrid
          students={students}
          loading={loading}
          error={error}
          onViewDetails={setViewStudent}
          onEdit={(s) => { setViewStudent(null); setEditingStudent(s); }}
        />
      </div>

      <StudentRegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRefresh={fetchStudents}
      />

      {viewStudent && (
        <ViewStudentModal
          student={viewStudent}
          onClose={() => setViewStudent(null)}
          onEdit={(s) => { setViewStudent(null); setEditingStudent(s); }}
        />
      )}

      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSaved={() => { fetchStudents(); setEditingStudent(null); }}
        />
      )}
    </>
  );
}
