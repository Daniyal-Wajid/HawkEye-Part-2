import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function DashboardLayout({ sidebarItems }) {
    return (
        <div className="flex min-h-screen bg-slate-100">
            <Sidebar items={sidebarItems} />
            <div className="flex-1 flex flex-col min-w-0">
                {/* We can place a generic topbar here if needed, or let pages have their own */}
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
