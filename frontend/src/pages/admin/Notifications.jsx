import Topbar from "../../components/Topbar";
import NotificationsList from "../../components/NotificationsList";

export default function Notifications() {
  return (
    <>
      <Topbar />

      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-slate-500">Stay updated with the latest system alerts.</p>
          </div>
        </div>

        <NotificationsList />
      </div>
    </>
  );
}
