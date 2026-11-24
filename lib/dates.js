// PURE FUNCTIONS ONLY — no side effects, no DOM, no chrome APIs

/**
 * Format timestamp as short date (e.g., "Jan 15")
 * @param {number} timestamp
 * @returns {string}
 */
function formatShortDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format timestamp as date with time (e.g., "Jan 15, 3:45 PM")
 * @param {number} timestamp
 * @returns {string}
 */
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format timestamp relative to now (e.g., "just now", "5m ago", "2h ago",
 * "3d ago"), falling back to the short date after a week.
 * @param {number} timestamp
 * @param {number} [now]
 * @returns {string}
 */
function formatRelativeDate(timestamp, now = Date.now()) {
  if (typeof timestamp !== "number") return "";
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(timestamp);
}
