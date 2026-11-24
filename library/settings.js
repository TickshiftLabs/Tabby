// SETTINGS — theme, export, import, move everything to Trash
// Depends on: library/load.js, library/dialogs.js, library/actions.js, storage/*

function renderSettingsFoot() {
  document.getElementById("places-foot").innerHTML = `
    <button class="quiet-btn theme-btn" data-action="toggle-theme" aria-label="Switch between light and dark theme"><svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg><svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
    <button class="quiet-btn" data-action="settings-menu" title="Export, import and more" aria-label="Settings">⋯</button>
    <input type="file" id="import-file" accept=".json,application/json" hidden>`;

  document.getElementById("import-file").addEventListener("change", handleImportFile);
}

ACTIONS["toggle-theme"] = async () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await chrome.storage.local.set({ tabby_theme: next });
};

ACTIONS["settings-menu"] = (el) => {
  showMenu(el, [
    { label: "Export…", onSelect: exportVault },
    { label: "Import…", onSelect: () => document.getElementById("import-file").click() },
    { divider: true },
    { label: "Move everything to Trash", danger: true, onSelect: moveEverythingToTrash },
  ]);
};

async function exportVault() {
  const [snapshots, folders, trash] = await Promise.all([getAllSnapshots(), getAllFolders(), getTrashItems()]);

  const exportData = {
    version: 1,
    exportedAt: Date.now(),
    data: { snapshots, folders, trash },
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tabby-vault-${new Date().toISOString().split("T")[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);

  showToast("Exported");
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  let incoming;
  try {
    incoming = JSON.parse(await file.text()).data;
  } catch {
    incoming = null;
  }
  if (!incoming || typeof incoming !== "object") {
    showToast("That is not a Tabby export file");
    return;
  }

  const inSnapshots = Array.isArray(incoming.snapshots) ? incoming.snapshots : [];
  const inFolders = Array.isArray(incoming.folders) ? incoming.folders : [];
  const inTrash = Array.isArray(incoming.trash) ? incoming.trash : [];

  if (inSnapshots.length + inFolders.length + inTrash.length === 0) {
    showToast("That export file is empty");
    return;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [];
  if (inSnapshots.length > 0) parts.push(plural(inSnapshots.length, "snapshot"));
  if (inFolders.length > 0) parts.push(plural(inFolders.length, "folder"));
  if (inTrash.length > 0) parts.push(plural(inTrash.length, "trash item"));

  const confirmed = await showConfirmDialog(
    "Import",
    `This adds ${parts.join(", ")} to what you already have. Anything you already have is skipped, and nothing is replaced.`,
    "Import"
  );
  if (!confirmed) return;

  const [snapshots, folders, trash] = await Promise.all([getAllSnapshots(), getAllFolders(), getTrashItems()]);
  const plan = planImport({ snapshots, folders, trash }, incoming);
  const addSnapshots = plan.snapshots;
  const addFolders = plan.folders;
  const addTrash = plan.trash;

  // One write, so an import is all-or-nothing.
  await chrome.storage.local.set({
    tabby_snapshots: [...snapshots, ...addSnapshots],
    tabby_folders: [...folders, ...addFolders],
    tabby_trash: [...trash, ...addTrash],
  });
  await reloadAll();

  const total = addSnapshots.length + addFolders.length + addTrash.length;
  showToast(total === 0 ? "All items already exist, nothing imported" : `Imported ${plural(total, "new item")}`);
}

async function moveEverythingToTrash() {
  // Counted from storage, so snapshots hidden from the list are included.
  const ids = (await getAllSnapshots()).map((snapshot) => snapshot.id);
  const count = ids.length;
  if (count === 0) {
    showToast("There is nothing to move");
    return;
  }
  const confirmed = await showConfirmDialog(
    "Move everything to Trash",
    `Move all ${count} snapshot${count === 1 ? "" : "s"} to Trash? Nothing is deleted, and open browser tabs stay open.`,
    "Move to Trash",
    true
  );
  if (!confirmed) return;

  const moved = await moveAllSnapshotsToTrash();
  state.selectedId = null;
  await reloadAll();
  showToastWithAction(`Moved ${moved} snapshot${moved === 1 ? "" : "s"} to Trash`, "Undo", async () => {
    await restoreManyFromTrash(ids);
    await reloadAll();
  });
}
