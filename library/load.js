// DATA LOADING ONLY — reads storage into state, then re-renders
// Depends on: library/state.js, library/render.js, storage/*

async function reloadAll() {
  const [snapshots, folders, trash] = await Promise.all([
    getAllSnapshots(),
    getAllFolders(),
    getTrashItems(),
  ]);

  // Snapshots with no tabs are hidden, not deleted.
  state.snapshots = snapshots.filter((s) => Array.isArray(s.tabs) && s.tabs.length > 0);
  state.folders = [...folders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  state.trash = trash;

  renderAll();
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if ("tabby_snapshots" in changes || "tabby_folders" in changes || "tabby_trash" in changes) {
      // Saved pages changed, so what counts as "already saved" may have too.
      reloadAll().then(refreshTidy);
    }
    if ("tabby_theme" in changes) {
      applyTheme(changes.tabby_theme.newValue);
    }
  });
}

function applyTheme(theme) {
  const resolved =
    theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", resolved);
}

async function loadTheme() {
  const result = await chrome.storage.local.get("tabby_theme");
  applyTheme(result.tabby_theme);
}
