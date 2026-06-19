import { useState, useEffect } from "react";
import Topbar from "../../components/Topbar";
import StatCard from "../../components/StatCard";
import { User, Bell, Shield, Activity } from "lucide-react";
import { apiGet } from "../../lib/api";

export default function StudentDashboard() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const data = await apiGet("/api/students/profile");
                setProfile(data);
            } catch (err) {
                console.error("Failed to fetch profile", err);
                setError(err.message || "Unable to load profile");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center text-center px-6">
                <div>
                    <p className="text-xl font-semibold text-slate-800">Unable to load your profile.</p>
                    <p className="text-slate-500 mt-2">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Topbar />

            <div className="p-6 space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">
                        Welcome, {profile?.student?.name || "Student"}!
                    </h1>
                    <p className="text-slate-500 mt-1">Here's your recognition system overview</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        title="Account Status"
                        value="Active"
                        icon={Shield}
                        color="bg-green-500"
                    />
                    <StatCard
                        title="Total Sessions"
                        value="12"
                        icon={Activity}
                        color="bg-blue-500"
                    />
                    <StatCard
                        title="Notifications"
                        value="3"
                        icon={Bell}
                        color="bg-amber-500"
                    />
                    <StatCard
                        title="Profile Security"
                        value="High"
                        icon={User}
                        color="bg-purple-500"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white p-8 rounded-2xl border shadow-sm space-y-6">
                        <h2 className="text-xl font-bold text-slate-800">Profile Details</h2>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-1">
                                <p className="text-sm text-slate-400 font-medium">Full Name</p>
                                <p className="text-lg font-semibold text-slate-700">{profile?.student?.name}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-slate-400 font-medium">Roll Number</p>
                                <p className="text-lg font-semibold text-slate-700">{profile?.student?.rollNumber}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-slate-400 font-medium">Email</p>
                                <p className="text-lg font-semibold text-slate-700">{profile?.student?.email}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-slate-400 font-medium">Joined Date</p>
                                <p className="text-lg font-semibold text-slate-700">
                                    {new Date(profile?.student?.createdAt || profile?.student?.created_at).toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <div className="pt-6 border-t">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Registration Video</h3>
                            <div className="aspect-video bg-slate-100 rounded-xl flex items-center justify-center border-2 border-dashed">
                                <p className="text-slate-500 font-medium italic">Video preview secured</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6">
                        <h2 className="text-xl font-bold text-slate-800">Recent Activity</h2>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-start gap-4 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-600"></div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">Face Recognized</p>
                                        <p className="text-xs text-slate-500">Main Gate - Camera 04</p>
                                        <p className="text-[10px] text-slate-400 mt-1">2 hours ago</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
