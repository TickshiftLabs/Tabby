// EVENT HANDLING — one delegated click listener, dispatching on data-action
// Depends on: library/state.js, library/render.js

// action name -> handler(element, event). Other files add their own entries.
const ACTIONS = {};

function setupActions() {
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const handler = ACTIONS[el.dataset.action];
    if (handler) handler(el, event);
  });
}

ACTIONS["select-place"] = (el) => {
  const type = el.dataset.placeType;
  selectPlace(type === "folder" ? { type, folderId: el.dataset.folderId } : { type });
};

ACTIONS["select-snapshot"] = (el) => {
  selectSnapshot(el.dataset.id);
};

ACTIONS["toggle-sort"] = () => {
  state.sort = state.sort === "recent" ? "alpha" : "recent";
  renderAll();
};

// ── Snapshot actions (detail toolbar) ─────────────────

ACTIONS["restore-snapshot"] = async () => {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  const count = snapshot.tabs.length;
  const confirmed = await showConfirmDialog(
    "Restore snapshot",
    `Open ${tabCountLabel(count)} from “${snapshotDisplayName(snapshot)}” in a new window?`,
    "Restore"
  );
  if (!confirmed) return;
  await restoreSnapshotWithGroup(snapshot);
  showToast(`Opened ${tabCountLabel(count)}`);
};

ACTIONS["toggle-star"] = async () => {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  await updateSnapshot(snapshot.id, { starred: !snapshot.starred });
  await reloadAll();
};

async function renameCurrentSnapshot() {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  const value = await showInputDialog(
    "Rename snapshot",
    "Leave empty to go back to the dated name.",
    snapshot.customName || ""
  );
  if (value === null) return;
  await updateSnapshot(snapshot.id, { customName: value.trim() });
  await reloadAll();
}

ACTIONS["rename-snapshot"] = renameCurrentSnapshot;

ACTIONS["move-snapshot"] = (el) => {
  const snapshot = currentSnapshot();
  if (!snapshot) return;

  const moveTo = async (folderId) => {
    await updateSnapshot(snapshot.id, { folderId });
    await reloadAll();
  };

  const items = state.folders.map((folder) => ({
    label: (folder.id === snapshot.folderId ? "✓ " : "") + folder.name,
    onSelect: () => moveTo(folder.id),
  }));
  if (items.length === 0) items.push({ note: "No folders yet" });
  if (snapshot.folderId) {
    items.push({ divider: true }, { label: "No folder", onSelect: () => moveTo(null) });
  }
  showMenu(el, items);
};

async function trashCurrentSnapshot() {
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  const id = snapshot.id;
  await moveSnapshotToTrash(id);
  await reloadAll();
  showToastWithAction("Moved to Trash", "Undo", async () => {
    await restoreFromTrash(id);
    state.selectedId = id;
    await reloadAll();
  });
}

ACTIONS["snapshot-menu"] = (el) => {
  showMenu(el, [
    { label: "Rename", onSelect: renameCurrentSnapshot },
    { divider: true },
    { label: "Move to Trash", danger: true, onSelect: trashCurrentSnapshot },
  ]);
};

// ── Tab actions (detail rows) ─────────────────────────

/**
 * The snapshot, position and tab entry for a control inside a tab row.
 */
function tabRefFrom(el) {
  const row = el.closest(".tab");
  const snapshot = currentSnapshot();
  if (!row || !snapshot) return null;
  const index = parseInt(row.dataset.tabIndex, 10);
  const tab = snapshot.tabs[index];
  if (!tab) return null;
  return { snapshot, index, tab };
}

// One tab action at a time: a second click before the list has re-rendered
// would act on a position that has already shifted.
let tabActionRunning = false;

async function runTabAction(action) {
  if (tabActionRunning) return;
  tabActionRunning = true;
  try {
    await action();
  } finally {
    tabActionRunning = false;
  }
}

/**
 * Move one tab to Trash and offer Undo. Removing a snapshot's last tab
 * moves the whole snapshot to Trash.
 */
async function removeTabWithUndo({ snapshot, index, tab }, message) {
  const snapshotId = snapshot.id;
  let undo;

  if (snapshot.tabs.length === 1) {
    await moveSnapshotToTrash(snapshotId);
    undo = () => restoreFromTrash(snapshotId);
  } else {
    const result = await moveTabToTrash(snapshotId, index, tab.url);
    if (!result || !result.success) {
      await reloadAll();
      showToast("That snapshot changed, so nothing was removed");
      return;
    }
    undo = () => undoTabTrash(result.trashId);
  }

  await reloadAll();
  showToastWithAction(message, "Undo", async () => {
    await undo();
    state.selectedId = snapshotId;
    await reloadAll();
  });
}

// Plain click on a title: open the tab, then move it to Trash (with Undo).
// Modified clicks keep the browser's own behaviour and remove nothing.
ACTIONS["open-tab"] = async (el, event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();

  const ref = tabRefFrom(el);
  if (!ref) return;

  await runTabAction(async () => {
    try {
      await openTab(ref.tab.url, ref.tab.pinned);
    } catch (err) {
      console.warn("[Tabby] Could not open tab:", err);
      showToast("That tab could not be opened, so it was kept");
      return;
    }
    await removeTabWithUndo(ref, "Opened · moved to Trash");
  });
};

function showMoveTabMenu(anchorEl, ref) {
  const others = sortSnapshots(
    state.snapshots.filter((s) => s.id !== ref.snapshot.id),
    "recent"
  );
  if (others.length === 0) {
    showMenu(anchorEl, [{ note: "No other snapshots" }]);
    return;
  }

  showMenu(
    anchorEl,
    others.map((target) => ({
      label: snapshotDisplayName(target),
      onSelect: () =>
        runTabAction(async () => {
          const sourceId = ref.snapshot.id;
          const result = await moveTabBetweenSnapshots(sourceId, ref.index, target.id, ref.tab.url);
          await reloadAll();
          if (!result || !result.success) {
            showToast("That snapshot changed, so nothing was moved");
            return;
          }
          const name = snapshotDisplayName(target);
          showToastWithAction(result.duplicated ? `Already in “${name}”` : `Moved to “${name}”`, "Undo", async () => {
            await undoMoveTab(result.undo);
            state.selectedId = sourceId;
            await reloadAll();
          });
        }),
    }))
  );
}

ACTIONS["tab-menu"] = (el) => {
  const ref = tabRefFrom(el);
  if (!ref) return;

  showMenu(el, [
    {
      label: "Open and keep",
      onSelect: () => openTab(ref.tab.url, ref.tab.pinned),
    },
    { label: "Move to snapshot…", onSelect: () => showMoveTabMenu(el, ref) },
    { divider: true },
    {
      label: "Remove",
      danger: true,
      onSelect: () => runTabAction(() => removeTabWithUndo(ref, "Moved to Trash")),
    },
  ]);
};

// ── Folders (places pane) ─────────────────────────────

ACTIONS["add-folder"] = async () => {
  const name = await showInputDialog("New folder", "Name", "");
  if (name === null || !name.trim()) return;
  const folder = await createFolder(name);
  if (folder) state.place = { type: "folder", folderId: folder.id };
  state.selectedId = null;
  await reloadAll();
};

async function renameFolderById(folderId) {
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const name = await showInputDialog("Rename folder", "Name", folder.name);
  if (name === null || !name.trim()) return;
  await renameFolder(folderId, name);
  await reloadAll();
}

async function deleteFolderById(folderId) {
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const count = state.snapshots.filter((s) => s.folderId === folderId).length;
  const kept =
    count === 0
      ? "It has no snapshots."
      : `Its ${count} snapshot${count === 1 ? " is" : "s are"} kept and move${count === 1 ? "s" : ""} to All snapshots.`;
  const confirmed = await showConfirmDialog("Delete folder", `Delete folder “${folder.name}”? ${kept}`, "Delete folder", true);
  if (!confirmed) return;

  const wasHere = state.place.type === "folder" && state.place.folderId === folderId;
  const removed = await deleteFolder(folderId);
  if (wasHere) {
    state.place = { type: "all" };
    state.selectedId = null;
  }
  await reloadAll();
  if (!removed) return;

  showToastWithAction(`Deleted folder “${folder.name}”`, "Undo", async () => {
    await restoreFolder(removed);
    if (wasHere) state.place = { type: "folder", folderId };
    await reloadAll();
  });
}

// Right-click a folder for Rename / Delete.
function setupFolderMenu() {
  document.getElementById("places").addEventListener("contextmenu", (event) => {
    const el = event.target.closest('.place[data-place-type="folder"]');
    if (!el) return;
    event.preventDefault();
    const folderId = el.dataset.folderId;
    showMenu(el, [
      { label: "Rename folder", onSelect: () => renameFolderById(folderId) },
      { divider: true },
      { label: "Delete folder", danger: true, onSelect: () => deleteFolderById(folderId) },
    ]);
  });
}

// ── Search ────────────────────────────────────────────

ACTIONS["show-all-tabs"] = () => {
  state.showAllFor = state.selectedId;
  renderAll();
};

function setupSearch() {
  const input = document.getElementById("search");

  input.addEventListener("input", () => {
    state.query = input.value;
    state.showAllFor = null;
    // Tidy up has nothing to search, so go to the snapshots. Trash is searched in place.
    if (state.place.type === "tidy") state.place = { type: "all" };
    renderAll();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const inField = target instanceof Element && target.matches("input, textarea, [contenteditable]");

    if (event.key === "/" && !inField && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      // In a narrow window the sidebar is collapsed and the search box hidden.
      if (input.offsetParent === null) document.getElementById("app").classList.add("places-open");
      input.focus();
      input.select();
    }

    if (event.key === "Escape" && target === input) {
      if (input.value !== "") {
        input.value = "";
        state.query = "";
        state.showAllFor = null;
        renderAll();
      } else {
        document.getElementById("app").classList.remove("places-open");
        input.blur();
      }
    }
  });
}

// ── Trash ─────────────────────────────────────────────

ACTIONS["restore-trash"] = async () => {
  const item = currentTrashItem();
  if (!item) return;
  const wasTab = item.trashType === "tab";
  await restoreFromTrash(item.id);
  state.selectedId = null;
  await reloadAll();
  showToast(wasTab ? "Restored as a new snapshot" : "Snapshot restored");
};

ACTIONS["delete-forever"] = async () => {
  const item = currentTrashItem();
  if (!item) return;
  const confirmed = await showConfirmDialog(
    "Delete forever",
    `“${snapshotDisplayName(item)}” will be permanently deleted. This cannot be undone.`,
    "Delete forever",
    true
  );
  if (!confirmed) return;
  await permanentlyDeleteFromTrash(item.id);
  state.selectedId = null;
  await reloadAll();
};

ACTIONS["empty-trash"] = async () => {
  const count = state.trash.length;
  if (count === 0) return;
  const confirmed = await showConfirmDialog(
    "Empty Trash",
    `${count} item${count === 1 ? "" : "s"} in the Trash will be permanently deleted. This cannot be undone.`,
    "Empty Trash",
    true
  );
  if (!confirmed) return;
  await emptyTrash();
  state.selectedId = null;
  await reloadAll();
};

// Narrow windows collapse the sidebar to icons; the logo expands it again.
ACTIONS["toggle-places"] = () => {
  document.getElementById("app").classList.toggle("places-open");
};
