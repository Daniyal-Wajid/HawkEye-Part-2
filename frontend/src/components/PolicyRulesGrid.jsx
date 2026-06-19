import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import PolicyRuleCard from "./PolicyRuleCard";
import EditRuleModal from "./EditRuleModal";
import { apiGet, apiDelete } from "../lib/api";

export default function PolicyRulesGrid() {
  const [policyRules, setPolicyRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingRule, setEditingRule] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      const data = await apiGet("/api/policy-rules");
      setPolicyRules(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async (rule) => {
    try {
      await apiDelete(`/api/policy-rules/${rule._id || rule.id}`);
      await fetchRules();
    } catch (err) {
      setError(err.message);
    }
  }, [fetchRules]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

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
      <div className="grid grid-cols-3 gap-6">
        {policyRules.map((rule) => (
          <PolicyRuleCard
            key={rule._id || rule.id}
            rule={{ ...rule, id: rule._id || rule.id }}
            onEdit={() => setEditingRule(rule)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {editingRule && (
        <EditRuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={fetchRules}
        />
      )}
    </>
  );
}
