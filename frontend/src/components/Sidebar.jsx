import { Shield, ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Sidebar({ items }) {
    const location = useLocation();
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem("sidebarExpanded");
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [isMobile, setIsMobile] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) {
                setIsExpanded(true); // Always "expanded" when visible on mobile (slide-over)
            }
        };

        handleResize(); // Initial check
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        if (!isMobile) {
            localStorage.setItem("sidebarExpanded", JSON.stringify(isExpanded));
        }
    }, [isExpanded, isMobile]);

    const toggleSidebar = () => setIsExpanded(!isExpanded);
    const toggleMobileMenu = () => setShowMobileMenu(!showMobileMenu);

    // Mobile Overlay
    if (isMobile) {
        return (
            <>
                <button
                    onClick={toggleMobileMenu}
                    className="fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-lg shadow-lg"
                >
                    <Menu className="w-6 h-6" />
                </button>

                {showMobileMenu && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                        onClick={() => setShowMobileMenu(false)}
                    />
                )}

                <aside className={`fixed top-0 left-0 h-full z-50 bg-slate-900 text-white transition-transform duration-300 ease-in-out ${showMobileMenu ? "translate-x-0" : "-translate-x-full"
                    } w-64 shadow-2xl`}>
                    <SidebarContent items={items} isExpanded={true} location={location} isMobile={true} closeMobile={() => setShowMobileMenu(false)} />
                </aside>
            </>
        );
    }

    // Desktop Sidebar
    return (
        <aside
            className={`sticky top-0 h-screen bg-slate-900 text-slate-100 flex flex-col transition-all duration-300 ease-in-out z-30 ${isExpanded ? "w-64" : "w-20"
                }`}
        >
            <SidebarContent
                items={items}
                isExpanded={isExpanded}
                location={location}
                toggleSidebar={toggleSidebar}
            />
        </aside>
    );
}

function SidebarContent({ items, isExpanded, location, toggleSidebar, isMobile, closeMobile }) {
    return (
        <>
            <div className={`flex items-center h-16 border-b border-slate-800 ${isExpanded ? "px-6" : "px-0 justify-center"}`}>
                <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                    <Shield className="w-8 h-8 text-blue-500 shrink-0" />
                    <span className={`text-xl font-bold transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0 w-0"
                        }`}>
                        HawkEye
                    </span>
                </div>
            </div>

            {!isMobile && (
                <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-20 bg-blue-600 text-white p-1 rounded-full shadow-lg hover:bg-blue-500 transition-colors z-50"
                >
                    {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
            )}

            <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {items.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

                    return (
                        <div key={item.label} className="relative group">
                            <Link
                                to={item.path}
                                onClick={isMobile ? closeMobile : undefined}
                                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group-hover:bg-slate-800 ${isActive
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
                                    : "text-slate-400 hover:text-white"
                                    } ${!isExpanded ? "justify-center" : ""}`}
                            >
                                <div className="relative shrink-0">
                                    {item.icon && <item.icon className={`w-5 h-5 transition-colors ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />}
                                    {item.badge && (
                                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                        </span>
                                    )}
                                </div>

                                <span className={`font-medium whitespace-nowrap transition-all duration-300 ${isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 absolute"
                                    }`}>
                                    {item.label}
                                </span>
                            </Link>

                            {/* Tooltip for collapsed state */}
                            {!isExpanded && !isMobile && (
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 border border-slate-700">
                                    {item.label}
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-r-slate-800" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className={`p-4 border-t border-slate-800 transition-all duration-300 ${isExpanded ? "opacity-100" : "opacity-0"}`}>
                <div className="text-xs text-slate-500 text-center whitespace-nowrap overflow-hidden">
                    &copy; 2026 HawkEye AI
                </div>
            </div>
        </>
    );
}
