import { useState, useEffect, useCallback } from "react";
import Topbar from "../../components/Topbar";
import UserStats from "../../components/UserStats";
import UsersTable from "../../components/UsersTable";
import { apiGet } from "../../lib/api";

export default function Users() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet("/api/users");
      setUsers(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const staffUsers = users.filter((u) => u.role !== "student");
  const totalUsers = staffUsers.length;
  const admins = staffUsers.filter((u) => u.role === "admin").length;
  const disciplineIncharge = staffUsers.filter((u) => u.role === "discipline_incharge").length;

  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Users Management</h1>
            <p className="text-slate-500">Manage system user accounts</p>
          </div>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Add User
          </button>
        </div>

        <UserStats
          totalUsers={totalUsers}
          admins={admins}
          disciplineIncharge={disciplineIncharge}
          loading={loading}
        />
        <UsersTable
          users={users.filter((u) => u.role !== "student")}
          loading={loading}
          error={error}
          setError={setError}
          fetchUsers={fetchUsers}
          createModalOpen={createModalOpen}
          setCreateModalOpen={setCreateModalOpen}
        />
      </div>
    </>
  );
}
