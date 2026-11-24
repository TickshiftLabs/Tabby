// STORAGE LAYER — trash lifecycle operations
// Depends on: storage/snapshots.js (STORAGE_KEY, getAllSnapshots, generateSnapshotId)

const TRASH_KEY = "tabby_trash";

async function getTrashItems() {
  const result = await chrome.storage.local.get(TRASH_KEY);
  return result[TRASH_KEY] || [];
}

async function moveSnapshotToTrash(snapshotId) {
  const snapshots = await getAllSnapshots();
  const index = snapshots.findIndex((s) => s.id === snapshotId);

  if (index === -1) {
    return false;
  }

  const snapshot = snapshots[index];

  // Add deletion metadata
  const trashedSnapshot = {
    ...snapshot,
    deletedAt: Date.now(),
    trashType: "snapshot",
  };

  // Remove from snapshots
  snapshots.splice(index, 1);

  // Add to trash
  const trash = await getTrashItems();
  trash.push(trashedSnapshot);

  await chrome.storage.local.set({
    [STORAGE_KEY]: snapshots,
    [TRASH_KEY]: trash,
  });

  return true;
}

/**
 * Move one tab to Trash. `expectedUrl` (optional) guards against a stale
 * position: if the tab at `tabIndex` is not that page, nothing happens.
 */
async function moveTabToTrash(snapshotId, tabIndex, expectedUrl) {
  const snapshots = await getAllSnapshots();
  const snapshotIndex = snapshots.findIndex((s) => s.id === snapshotId);

  if (snapshotIndex === -1) {
    return { success: false, snapshotEmpty: false };
  }

  const snapshot = snapshots[snapshotIndex];

  if (tabIndex < 0 || tabIndex >= snapshot.tabs.length) {
    return { success: false, snapshotEmpty: false };
  }

  const removedTab = snapshot.tabs[tabIndex];

  if (
    expectedUrl !== undefined &&
    normalizeUrlForDedup(expectedUrl) !== normalizeUrlForDedup(removedTab.url)
  ) {
    return { success: false, snapshotEmpty: false };
  }

  // Create a trash item for the single tab
  const trashedTab = {
    id: `trash_tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: removedTab.title || "Untitled Tab",
    deletedAt: Date.now(),
    trashType: "tab",
    sourceSnapshotId: snapshotId,
    sourceSnapshotName: snapshot.customName || snapshot.name,
    tabs: [removedTab],
  };

  // Remove from snapshot
  snapshot.tabs.splice(tabIndex, 1);

  const snapshotEmpty = snapshot.tabs.length === 0;

  // If snapshot is now empty, remove it from storage
  if (snapshotEmpty) {
    snapshots.splice(snapshotIndex, 1);
  }

  // Add to trash
  const trash = await getTrashItems();
  trash.push(trashedTab);

  await chrome.storage.local.set({
    [STORAGE_KEY]: snapshots,
    [TRASH_KEY]: trash,
  });

  return { success: true, snapshotEmpty, trashId: trashedTab.id };
}

async function restoreFromTrash(trashId) {
  const trash = await getTrashItems();
  const index = trash.findIndex((item) => item.id === trashId);

  if (index === -1) {
    return false;
  }

  const item = trash[index];

  // Remove deletion metadata
  const { deletedAt, trashType, sourceSnapshotId, sourceSnapshotName, ...cleanItem } = item;

  // For single tabs, create a new snapshot
  // For full snapshots, restore directly
  const snapshots = await getAllSnapshots();

  if (trashType === "tab") {
    // Create a new snapshot for the restored tab
    const restoredSnapshot = {
      id: generateSnapshotId(),
      name: `Restored: ${item.name}`,
      createdAt: Date.now(),
      reason: "restored",
      tabs: item.tabs,
      tags: [],
    };
    snapshots.push(restoredSnapshot);
  } else {
    // Restore the full snapshot
    snapshots.push(cleanItem);
  }

  // Remove from trash
  trash.splice(index, 1);

  await chrome.storage.local.set({
    [STORAGE_KEY]: snapshots,
    [TRASH_KEY]: trash,
  });

  return true;
}

async function permanentlyDeleteFromTrash(trashId) {
  const trash = await getTrashItems();
  const index = trash.findIndex((item) => item.id === trashId);

  if (index === -1) {
    return false;
  }

  trash.splice(index, 1);
  await chrome.storage.local.set({ [TRASH_KEY]: trash });

  return true;
}

async function emptyTrash() {
  await chrome.storage.local.set({ [TRASH_KEY]: [] });
  return true;
}

/**
 * Move every snapshot to Trash in one write. Nothing is deleted.
 * @returns {Promise<number>} how many snapshots were moved
 */
async function moveAllSnapshotsToTrash() {
  const snapshots = await getAllSnapshots();
  if (snapshots.length === 0) return 0;

  const deletedAt = Date.now();
  const trash = await getTrashItems();
  for (const snapshot of snapshots) {
    trash.push({ ...snapshot, deletedAt, trashType: "snapshot" });
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: [],
    [TRASH_KEY]: trash,
  });

  return snapshots.length;
}

/**
 * Undo a moveTabToTrash: put the trashed tab back into the snapshot it
 * came from, or restore it as its own snapshot if that one is gone.
 * Works from the trash item itself, so it can never touch another item.
 */
async function undoTabTrash(trashId) {
  const trash = await getTrashItems();
  const index = trash.findIndex((item) => item.id === trashId);
  if (index === -1) return false;

  const item = trash[index];
  if (item.trashType !== "tab") return false;

  const snapshots = await getAllSnapshots();
  const source = snapshots.find((s) => s.id === item.sourceSnapshotId);
  const tab = (item.tabs || [])[0];

  if (source && Array.isArray(source.tabs) && tab) {
    const normalizedUrl = normalizeUrlForDedup(tab.url);
    if (!source.tabs.some((t) => t && normalizeUrlForDedup(t.url) === normalizedUrl)) {
      source.tabs.push(tab);
    }
  } else {
    snapshots.push({
      id: generateSnapshotId(),
      name: `Restored: ${item.name}`,
      createdAt: Date.now(),
      reason: "restored",
      tabs: item.tabs || [],
      tags: [],
    });
  }

  trash.splice(index, 1);
  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots, [TRASH_KEY]: trash });
  return true;
}

/**
 * Restore several trashed snapshots in one write.
 * @returns {Promise<number>} how many were restored
 */
async function restoreManyFromTrash(ids) {
  const wanted = new Set(ids);
  const trash = await getTrashItems();
  const snapshots = await getAllSnapshots();

  const remaining = [];
  let restored = 0;
  for (const item of trash) {
    if (wanted.has(item.id) && item.trashType === "snapshot") {
      const { deletedAt, trashType, ...snapshot } = item;
      snapshots.push(snapshot);
      restored += 1;
    } else {
      remaining.push(item);
    }
  }

  if (restored > 0) {
    await chrome.storage.local.set({ [STORAGE_KEY]: snapshots, [TRASH_KEY]: remaining });
  }
  return restored;
}
