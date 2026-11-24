// STORAGE LAYER — folder operations
// Depends on: storage/snapshots.js (updateSnapshot)

const FOLDERS_KEY = "tabby_folders";

function generateFolderId() {
  return `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function getAllFolders() {
  const result = await chrome.storage.local.get(FOLDERS_KEY);
  return result[FOLDERS_KEY] || [];
}

async function createFolder(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;

  const folders = await getAllFolders();
  const folder = {
    id: generateFolderId(),
    name: trimmed,
    createdAt: Date.now(),
  };

  folders.push(folder);
  await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
  return folder;
}

async function renameFolder(folderId, newName) {
  const trimmed = (newName || "").trim();
  if (!trimmed) return null;

  const folders = await getAllFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;

  folder.name = trimmed;
  await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
  return folder;
}

/**
 * Delete a folder. Its snapshots are kept and simply lose the folder.
 * @returns {Promise<{folder: Object, snapshotIds: string[]}|null>} what was
 *   removed (pass it to restoreFolder to undo), or null if there was no such folder
 */
async function deleteFolder(folderId) {
  const result = await chrome.storage.local.get([FOLDERS_KEY, "tabby_snapshots"]);
  const folders = result[FOLDERS_KEY] || [];
  const snapshots = result["tabby_snapshots"] || [];

  const index = folders.findIndex((f) => f.id === folderId);
  if (index === -1) return null;

  const [folder] = folders.splice(index, 1);

  const snapshotIds = [];
  for (const snapshot of snapshots) {
    if (snapshot.folderId === folderId) {
      snapshot.folderId = null;
      snapshotIds.push(snapshot.id);
    }
  }

  await chrome.storage.local.set({
    [FOLDERS_KEY]: folders,
    tabby_snapshots: snapshots,
  });
  return { folder, snapshotIds };
}

/**
 * Undo a deleteFolder. Snapshots that were filed elsewhere in the
 * meantime are left where they are.
 */
async function restoreFolder(removed) {
  if (!removed || !removed.folder) return false;

  const result = await chrome.storage.local.get([FOLDERS_KEY, "tabby_snapshots"]);
  const folders = result[FOLDERS_KEY] || [];
  const snapshots = result["tabby_snapshots"] || [];

  if (!folders.some((f) => f.id === removed.folder.id)) folders.push(removed.folder);

  const wanted = new Set(removed.snapshotIds || []);
  for (const snapshot of snapshots) {
    if (wanted.has(snapshot.id) && !snapshot.folderId) snapshot.folderId = removed.folder.id;
  }

  await chrome.storage.local.set({
    [FOLDERS_KEY]: folders,
    tabby_snapshots: snapshots,
  });
  return true;
}
