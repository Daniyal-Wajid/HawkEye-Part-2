import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";
import { adminSidebarItems, inchargeSidebarItems, studentSidebarItems } from "./config/navigation";

/* Admin pages */
import Analytics from "./pages/admin/Analytics";
import Cameras from "./pages/admin/Cameras";
import HistoryLogs from "./pages/admin/HistoryLogs";
import Notifications from "./pages/admin/Notifications";
import PolicyRules from "./pages/admin/PolicyRules";
import Students from "./pages/admin/Students";
import UsersPage from "./pages/admin/Users";
import Violations from "./pages/admin/Violations";
import ManualViolations from "./pages/admin/ManualViolations";
import AdminDashboard from "./pages/admin/AdminDashboard";

/* Discipline Incharge pages */
import InchargeDashboard from "./pages/incharge/InchargeDashboard";
import InchargeViolations from "./pages/incharge/InchargeViolations";
import InchargeManualViolations from "./pages/incharge/InchargeManualViolations";
import InchargeStudents from "./pages/incharge/InchargeStudents";
import InchargeNotifications from "./pages/incharge/InchargeNotifications";
import ReviewQueue from "./pages/incharge/ReviewQueue";
import PenaltiesChallans from "./pages/incharge/PenaltiesChallans";
import Rewards from "./pages/incharge/Rewards";
/* Student pages */
import StudentDashboard from "./pages/student/StudentDashboard";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Admin Layout */}
        <Route element={<DashboardLayout sidebarItems={adminSidebarItems} />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/cameras" element={<Cameras />} />
          <Route path="/history-logs" element={<HistoryLogs />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/policy-rules" element={<PolicyRules />} />
          <Route path="/students" element={<Students />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/violations" element={<Violations />} />
          <Route path="/manual-violations" element={<ManualViolations />} />
        </Route>

        {/* Discipline Incharge Layout */}
        <Route element={<DashboardLayout sidebarItems={inchargeSidebarItems} />}>
          <Route path="/incharge/dashboard" element={<InchargeDashboard />} />
          <Route path="/incharge/violations" element={<InchargeViolations />} />
          <Route path="/incharge/manual-violations" element={<InchargeManualViolations />} />
          <Route path="/incharge/students" element={<InchargeStudents />} />
          <Route path="/incharge/notifications" element={<InchargeNotifications />} />
          <Route path="/incharge/reviews" element={<ReviewQueue />} />
          <Route path="/incharge/penalties" element={<PenaltiesChallans />} />
          <Route path="/incharge/rewards" element={<Rewards />} />
        </Route>

        {/* Student Layout */}
        <Route element={<DashboardLayout sidebarItems={studentSidebarItems} />}>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/notifications" element={<Notifications />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}
