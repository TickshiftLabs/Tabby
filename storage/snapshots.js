// STORAGE LAYER — snapshot CRUD operations
// Depends on: storage/dedup.js

const STORAGE_KEY = "tabby_snapshots";

function generateSnapshotId() {
  return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateSnapshotName(tabs) {
  const domainCounts = new Map();

  for (const tab of tabs) {
    if (tab.domain) {
      const count = domainCounts.get(tab.domain) || 0;
      domainCounts.set(tab.domain, count + 1);
    }
  }

  const sortedDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain]) => domain);

  const date = new Date();
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (sortedDomains.length === 0) {
    return `${tabs.length} tabs - ${dateStr}`;
  }

  return `${sortedDomains.join(", ")} - ${dateStr}`;
}

async function getAllSnapshots() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function getSnapshot(id) {
  const snapshots = await getAllSnapshots();
  return snapshots.find((s) => s.id === id) || null;
}

async function saveSnapshot(tabs, reason = "") {
  const tabEntries = tabs.map(createTabEntry);
  const uniqueTabs = deduplicateTabs(tabEntries);

  if (uniqueTabs.length === 0) {
    return null;
  }

  // Check if an existing snapshot has the same URLs
  const existing = await getAllSnapshots();
  const duplicateSnapshot = existing.find(
    (snap) => Array.isArray(snap.tabs) && snapshotsHaveSameUrls(snap.tabs, uniqueTabs)
  );

  if (duplicateSnapshot) {
    // Return existing snapshot instead of creating duplicate
    return { ...duplicateSnapshot, isDuplicate: true };
  }

  const snapshot = {
    id: generateSnapshotId(),
    name: generateSnapshotName(uniqueTabs),
    createdAt: Date.now(),
    reason: reason,
    starred: false,
    folderId: null,
    note: null,
    aiSummary: null,
    tabs: uniqueTabs,
  };

  existing.push(snapshot);
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });

  return snapshot;
}

async function updateSnapshot(id, updates) {
  const snapshots = await getAllSnapshots();
  const index = snapshots.findIndex((s) => s.id === id);

  if (index === -1) {
    return null;
  }

  // Only allow updating safe fields
  const allowedFields = ["name", "customName", "tags", "starred", "folderId", "note", "aiSummary"];
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      snapshots[index][key] = updates[key];
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots });
  return snapshots[index];
}

/**
 * Move one tab from a snapshot to another.
 * - `expectedUrl` (optional) guards against a stale position: if the tab at
 *   `tabIndex` is not that page, nothing happens.
 * - If the target already has the page, the tab is only removed from the source.
 * - If the source ends up empty it goes to Trash as it was, never to nowhere.
 * The returned `undo` record can be passed to undoMoveTab.
 */
async function moveTabBetweenSnapshots(sourceId, tabIndex, targetId, expectedUrl) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { success: false };
  }

  const stored = await chrome.storage.local.get([STORAGE_KEY, "tabby_trash"]);
  const snapshots = stored[STORAGE_KEY] || [];
  const trash = stored.tabby_trash || [];
  const source = snapshots.find((s) => s.id === sourceId);
  const target = snapshots.find((s) => s.id === targetId);

  if (!source || !target || !Array.isArray(source.tabs)) {
    return { success: false };
  }

  const tab = source.tabs[tabIndex];
  if (!tab) {
    return { success: false };
  }

  const normalizedUrl = normalizeUrlForDedup(tab.url);
  if (expectedUrl !== undefined && normalizeUrlForDedup(expectedUrl) !== normalizedUrl) {
    return { success: false };
  }

  if (!Array.isArray(target.tabs)) target.tabs = [];
  const targetHasUrl = target.tabs.some((t) => normalizeUrlForDedup(t.url) === normalizedUrl);
  const sourceEmpty = source.tabs.length === 1;

  if (sourceEmpty) {
    // Keep the snapshot (name, star, folder, its tab) recoverable.
    trash.push({ ...source, deletedAt: Date.now(), trashType: "snapshot" });
    snapshots.splice(snapshots.indexOf(source), 1);
  } else {
    source.tabs.splice(tabIndex, 1);
  }
  if (!targetHasUrl) {
    target.tabs.push(tab);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots, tabby_trash: trash });

  return {
    success: true,
    movedTab: tab,
    duplicated: targetHasUrl,
    sourceEmpty,
    undo: { sourceId, targetId, tab, sourceIndex: tabIndex, addedToTarget: !targetHasUrl, sourceTrashed: sourceEmpty },
  };
}

/**
 * Reverse a moveTabBetweenSnapshots call, using its `undo` record.
 */
async function undoMoveTab(undo) {
  if (!undo || !undo.tab) return false;

  const stored = await chrome.storage.local.get([STORAGE_KEY, "tabby_trash"]);
  const snapshots = stored[STORAGE_KEY] || [];
  const trash = stored.tabby_trash || [];
  const normalizedUrl = normalizeUrlForDedup(undo.tab.url);
  const sameUrl = (t) => t && normalizeUrlForDedup(t.url) === normalizedUrl;

  if (undo.sourceTrashed) {
    const trashIndex = trash.findIndex((item) => item.id === undo.sourceId);
    if (trashIndex !== -1) {
      const { deletedAt, trashType, ...snapshot } = trash[trashIndex];
      trash.splice(trashIndex, 1);
      snapshots.push(snapshot);
    }
  } else {
    const source = snapshots.find((s) => s.id === undo.sourceId);
    if (source && Array.isArray(source.tabs) && !source.tabs.some(sameUrl)) {
      source.tabs.splice(Math.min(undo.sourceIndex, source.tabs.length), 0, undo.tab);
    }
  }

  if (undo.addedToTarget) {
    const target = snapshots.find((s) => s.id === undo.targetId);
    if (target && Array.isArray(target.tabs)) {
      const index = target.tabs.findIndex(sameUrl);
      if (index !== -1) target.tabs.splice(index, 1);
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots, tabby_trash: trash });
  return true;
}

async function addTabToSnapshot(snapshotId, tab) {
  if (!snapshotId || !tab) return { success: false };

  const snapshots = await getAllSnapshots();
  const snapshot = snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return { success: false };

  const normalizedUrl = normalizeUrlForDedup(tab.url);
  const alreadyExists = snapshot.tabs.some((t) => normalizeUrlForDedup(t.url) === normalizedUrl);
  if (alreadyExists) {
    return { success: false, duplicated: true };
  }

  snapshot.tabs.push(tab);
  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots });
  return { success: true };
}
