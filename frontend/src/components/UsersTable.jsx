import { useState, useCallback } from "react";
import { Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import RoleBadge from "./RoleBadge";
import { apiDelete } from "../lib/api";
import CreateUserModal from "./CreateUserModal";
import EditUserModal from "./EditUserModal";

export default function UsersTable({ users = [], loading, error, setError, fetchUsers, createModalOpen, setCreateModalOpen }) {
  const [editingUser, setEditingUser] = useState(null);

  const handleDelete = useCallback(async (u) => {
    if (!window.confirm(`Delete user "${u.name || u.email}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/api/users/${u._id || u.id}`);
      await fetchUsers();
    } catch (err) {
      setError?.(err.message);
    }
  }, [fetchUsers, setError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-600">
        <AlertCircle className="shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">All Users</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">User ID</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr key={u._id || u.id} className="border-t">
                  <td className="px-4 py-4 font-medium font-mono text-xs">{u._id || u.id}</td>
                  <td className="px-4 py-4">{u.name ?? "-"}</td>
                  <td className="px-4 py-4">{u.email}</td>
                  <td className="px-4 py-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-4">{u.department ?? "-"}</td>
                  <td className="px-4 py-4 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className="flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <Pencil size={16} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(u)}
                      className="flex items-center gap-2 text-red-600 hover:underline"
                      title="Delete user"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createModalOpen && (
        <CreateUserModal
          onClose={() => setCreateModalOpen(false)}
          onSaved={() => { fetchUsers(); setCreateModalOpen(false); }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { fetchUsers(); setEditingUser(null); }}
        />
      )}
    </>
  );
}
