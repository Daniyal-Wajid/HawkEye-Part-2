export default function SeverityBadge({ level }) {
  const styles = {
    LOW: "bg-blue-100 text-blue-700",
    MED: "bg-indigo-100 text-indigo-700",
    HIGH: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[level]}`}
    >
      {level}
    </span>
  );
}
