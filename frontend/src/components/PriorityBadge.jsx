export default function PriorityBadge({ level }) {
  const styles = {
    HIGH: "bg-blue-600 text-white",
    MED: "bg-orange-100 text-orange-600",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[level]}`}>
      {level}
    </span>
  );
}
