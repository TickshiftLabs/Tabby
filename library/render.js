// RENDERING ONLY — renders every pane from state
// Depends on: library/render-places.js, render-list.js, render-detail.js

const EMPTY_VAULT_MESSAGE =
  "Nothing saved yet. Right-click any page and choose “Save this tab to Tabby”, or use the Tabby button in the toolbar.";

function isSnapshotPlace() {
  return state.place.type === "all" || state.place.type === "starred" || state.place.type === "folder";
}

/**
 * What identifies a control across a re-render: its action plus the
 * snapshot, place or tab row it belongs to.
 */
function focusKeyOf(el) {
  if (!el || !el.dataset || !el.dataset.action) return null;
  const row = el.closest(".tab");
  return {
    action: el.dataset.action,
    id: el.dataset.id || "",
    placeType: el.dataset.placeType || "",
    folderId: el.dataset.folderId || "",
    tabIndex: row ? row.dataset.tabIndex : "",
  };
}

function findByFocusKey(key) {
  if (!key) return null;
  for (const el of document.querySelectorAll(`#app [data-action="${key.action}"]`)) {
    const other = focusKeyOf(el);
    if (other.id === key.id && other.placeType === key.placeType && other.folderId === key.folderId && other.tabIndex === key.tabIndex) {
      return el;
    }
  }
  return null;
}

// Panes are rebuilt from state, which would drop keyboard focus each time.
function renderAll() {
  const active = document.activeElement;
  const key = active && active.closest("#app") ? focusKeyOf(active) : null;
  renderPanes();
  if (key && !document.activeElement.closest("#app, .dialog, .menu")) {
    const match = findByFocusKey(key);
    if (match) match.focus();
  }
}

function renderPanes() {
  // A folder that was deleted elsewhere falls back to All.
  if (state.place.type === "folder" && !state.folders.some((f) => f.id === state.place.folderId)) {
    state.place = { type: "all" };
  }

  const app = document.getElementById("app");
  const vaultEmpty = state.snapshots.length === 0 && isSnapshotPlace();
  app.classList.toggle("wide", vaultEmpty || state.place.type === "tidy");

  renderPlaces();

  if (vaultEmpty) {
    document.getElementById("detail").innerHTML = `<div class="detail-empty">${EMPTY_VAULT_MESSAGE}</div>`;
    return;
  }

  if (isSnapshotPlace()) {
    state.selectedId = resolveSelection(
      state.selectedId,
      visibleSnapshots().map((row) => row.snapshot)
    );
  }

  if (state.place.type === "tidy") {
    renderTidy();
    return;
  }


  if (state.place.type === "trash") {
    state.selectedId = resolveSelection(state.selectedId, sortedTrash());
    renderList();
    renderTrashDetail();
    return;
  }

  renderList();
  renderDetail();
}

function selectPlace(place) {
  state.place = place;
  state.selectedId = null;
  renderAll();
  // Open tabs may have changed since the last look.
  if (place.type === "tidy") refreshTidy();
}

function selectSnapshot(id) {
  state.selectedId = id;
  renderAll();
}
