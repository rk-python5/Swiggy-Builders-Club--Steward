export function relativeTime(date: Date, now: Date = new Date()): string {
  const ms = now.getTime() - date.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function rupees(amountPaise: number | null): string {
  if (amountPaise === null) return "";
  return `₹${(amountPaise / 100).toFixed(0)}`;
}
