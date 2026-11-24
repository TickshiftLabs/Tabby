// RENDERING ONLY — Trash: list and read-only detail
// Depends on: library/state.js, library/model.js, library/render-list.js, lib/dates.js

// Newest first, narrowed by the search box.
function sortedTrash() {
  const newestFirst = [...state.trash].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  return searchSnapshots(newestFirst, state.query).map((row) => row.snapshot);
}

function currentTrashItem() {
  return state.trash.find((item) => item.id === state.selectedId) || null;
}

function trashRowHtml(item) {
  const selected = item.id === state.selectedId ? " selected" : "";
  const tabs = Array.isArray(item.tabs) ? item.tabs : [];
  const what = item.trashType === "tab" ? "1 tab" : tabCountLabel(tabs.length);
  return `
    <button class="row${selected}" data-action="select-snapshot" data-id="${escapeHtml(item.id)}">
      <span class="row-name">${highlight(snapshotDisplayName(item), state.query)}</span>
      <span class="row-meta"><span>${what} · deleted ${escapeHtml(formatRelativeDate(item.deletedAt))}</span></span>
    </button>`;
}

function renderTrashList(list) {
  const items = sortedTrash();
  if (items.length === 0) {
    const query = state.query.trim();
    list.innerHTML =
      query && state.trash.length > 0
        ? `<div class="list-empty">Nothing in Trash matches “${escapeHtml(query)}”.</div>`
        : `<div class="list-empty">Trash is empty.</div>`;
    return;
  }
  list.innerHTML = `
    <div class="list-tools">
      <button class="quiet-btn" data-action="empty-trash">Empty Trash</button>
    </div>
    ${items.map(trashRowHtml).join("")}`;
}

function renderTrashDetail() {
  const detail = document.getElementById("detail");
  const item = currentTrashItem();

  if (!item) {
    detail.innerHTML = `<div class="detail-empty">Things you remove wait here until you empty the Trash.</div>`;
    return;
  }

  const tabs = Array.isArray(item.tabs) ? item.tabs : [];
  const meta = [
    item.trashType === "tab" ? "1 tab" : tabCountLabel(tabs.length),
    item.deletedAt ? `deleted ${formatDateTime(item.deletedAt)}` : null,
    item.trashType === "tab" && item.sourceSnapshotName ? `from “${item.sourceSnapshotName}”` : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const rows = tabs
    .map(
      (tab) => `
      <li class="tab">
        ${faviconHtml(tab.favicon, tab.domain)}
        <span class="tab-title" title="${escapeHtml(tab.url || "")}">${highlight(tab.title || tab.url || "Untitled", state.query)}</span>
      </li>`
    )
    .join("");

  detail.innerHTML = `
    <header class="detail-head">
      <h1 class="detail-name">${escapeHtml(snapshotDisplayName(item))}</h1>
      <p class="detail-meta">${meta}</p>
      <div class="toolbar">
        <button class="btn btn-primary" data-action="restore-trash">Restore</button>
        <button class="btn btn-danger" data-action="delete-forever">Delete forever</button>
      </div>
    </header>
    <ul class="tabs trash-tabs">${rows}</ul>`;
}
