// LIBRARY INITIALIZATION — entry point
// Depends on: every library/* module

document.addEventListener("DOMContentLoaded", async () => {
  await loadTheme();

  // library.html#snapshot=<id> opens on that snapshot, also when the
  // popup points an already open Library at another one.
  selectSnapshotFromHash();
  window.addEventListener("hashchange", () => {
    if (selectSnapshotFromHash()) renderAll();
  });

  setupActions();
  setupMenuDismissal();
  setupFolderMenu();
  setupSearch();
  setupStorageListener();
  setupFaviconFallback();

  setupTidy();
  renderSettingsFoot();

  await reloadAll();
  await refreshTidy();
});

// Inline onerror handlers are not allowed on extension pages, so broken
// favicons are caught here and replaced with the site's initial.
function setupFaviconFallback() {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains("fav")) return;
      const span = document.createElement("span");
      span.className = "fav fav-initial";
      span.textContent = img.dataset.initial || "?";
      img.replaceWith(span);
    },
    true
  );
}

function selectSnapshotFromHash() {
  const match = window.location.hash.match(/^#snapshot=(.+)$/);
  if (!match) return false;
  state.place = { type: "all" };
  state.query = "";
  state.showAllFor = null;
  state.selectedId = decodeURIComponent(match[1]);
  const input = document.getElementById("search");
  if (input) input.value = "";
  return true;
}
