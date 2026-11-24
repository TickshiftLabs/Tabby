// PURE FUNCTIONS ONLY — no DOM, no chrome APIs
// Library model: names, places, sorting, search, grouping, selection.
// Depends on: lib/dates.js (formatShortDate)

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Text as HTML, with case-insensitive matches of query wrapped in <mark>.
 * Matching runs on the raw text and each piece is escaped separately, so a
 * match can never land inside an HTML entity.
 */
function highlight(text, query) {
  const raw = String(text ?? "");
  const needle = (query || "").trim();
  if (!needle) return escapeHtml(raw);

  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let html = "";
  let last = 0;
  for (const match of raw.matchAll(pattern)) {
    html += escapeHtml(raw.slice(last, match.index)) + `<mark>${escapeHtml(match[0])}</mark>`;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(raw.slice(last));
}

/**
 * Name shown for a snapshot or a trash item.
 */
function snapshotDisplayName(snapshot) {
  if (!snapshot) return "";
  if (snapshot.trashType === "tab") return snapshot.name || "Untitled tab";
  const custom = (snapshot.customName || "").trim();
  if (custom) return custom;
  return `Snapshot · ${formatShortDate(snapshot.createdAt)}`;
}

/**
 * Snapshots belonging to a place: {type:"all"}, {type:"starred"},
 * or {type:"folder", folderId}.
 */
function snapshotsForPlace(snapshots, folders, place) {
  if (!place || place.type === "all") return [...snapshots];
  if (place.type === "starred") return snapshots.filter((s) => s.starred);
  if (place.type === "folder") return snapshots.filter((s) => s.folderId === place.folderId);
  return [];
}

function placeCounts(snapshots, folders) {
  const folderCounts = {};
  for (const folder of folders) folderCounts[folder.id] = 0;

  let starred = 0;
  for (const snapshot of snapshots) {
    if (snapshot.starred) starred += 1;
    // A folderId that no longer exists is counted nowhere but "all".
    if (snapshot.folderId in folderCounts) folderCounts[snapshot.folderId] += 1;
  }

  return { all: snapshots.length, starred, folders: folderCounts };
}

function sortSnapshots(snapshots, sort) {
  const sorted = [...snapshots];
  if (sort === "alpha") {
    sorted.sort((a, b) =>
      snapshotDisplayName(a).localeCompare(snapshotDisplayName(b), undefined, { sensitivity: "base" })
    );
  } else {
    sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return sorted;
}

function tabMatchesQuery(tab, needle) {
  if (!tab) return false;
  return [tab.title, tab.domain, tab.url].some(
    (field) => typeof field === "string" && field.toLowerCase().includes(needle)
  );
}

/**
 * Snapshots matching a query, with the positions of their matching tabs.
 * A blank query matches everything. A name match returns all tabs.
 */
function searchSnapshots(snapshots, query) {
  const needle = (query || "").trim().toLowerCase();
  const results = [];

  for (const snapshot of snapshots) {
    const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
    const allIndices = tabs.map((_, index) => index);

    if (!needle) {
      results.push({ snapshot, matchIndices: allIndices });
      continue;
    }

    if (snapshotDisplayName(snapshot).toLowerCase().includes(needle)) {
      results.push({ snapshot, matchIndices: allIndices });
      continue;
    }

    const matchIndices = allIndices.filter((index) => tabMatchesQuery(tabs[index], needle));
    if (matchIndices.length > 0) results.push({ snapshot, matchIndices });
  }

  return results;
}

/**
 * Group tabs by domain, largest group first. Each item keeps its position
 * in the original tabs array. `indices` restricts the result to those positions.
 */
function groupTabsByDomain(tabs, indices) {
  const list = Array.isArray(tabs) ? tabs : [];
  const wanted = Array.isArray(indices) ? new Set(indices) : null;
  const groups = new Map();

  list.forEach((tab, index) => {
    if (!tab) return;
    if (wanted && !wanted.has(index)) return;
    const domain = tab.domain || "Other";
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push({ tab, index });
  });

  return [...groups.entries()]
    .map(([domain, items]) => ({ domain, items }))
    .sort((a, b) => b.items.length - a.items.length || a.domain.localeCompare(b.domain));
}

/**
 * The most frequent distinct domains of a snapshot, for its icon stack.
 */
function siteIcons(snapshot, max = 3) {
  const tabs = snapshot && Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
  return groupTabsByDomain(tabs)
    .slice(0, max)
    .map((group) => ({
      domain: group.domain,
      favicon: (group.items.find((item) => item.tab.favicon) || { tab: {} }).tab.favicon || "",
    }));
}

/**
 * Keep the current selection if it is still visible, else pick the first.
 */
function resolveSelection(selectedId, visibleSnapshots) {
  if (visibleSnapshots.some((s) => s.id === selectedId)) return selectedId;
  return visibleSnapshots.length > 0 ? visibleSnapshots[0].id : null;
}

/**
 * Items from `incoming` that have an id not already in `existing`.
 * With `requireTabs`, items without a tabs array are skipped too.
 */
function newItemsById(existing, incoming, requireTabs) {
  const known = new Set(existing.map((item) => item.id));
  const added = [];
  for (const item of incoming) {
    if (!item || !item.id || known.has(item.id)) continue;
    if (requireTabs && !Array.isArray(item.tabs)) continue;
    known.add(item.id);
    added.push(item);
  }
  return added;
}

/**
 * What an import should add: only items whose id is not already present.
 * A snapshot id counts as present whether it is saved or in Trash, so an
 * import never brings back something that was trashed, and never puts a
 * second copy of a saved snapshot into Trash.
 * @returns {{snapshots: Array, folders: Array, trash: Array}}
 */
function planImport(existing, incoming) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const source = incoming || {};

  const haveSnapshots = [...list(existing.snapshots), ...list(existing.trash)];
  const snapshots = newItemsById(haveSnapshots, list(source.snapshots), true);
  const trash = newItemsById([...haveSnapshots, ...snapshots], list(source.trash), true);
  const folders = newItemsById(list(existing.folders), list(source.folders), false);

  return { snapshots, folders, trash };
}
