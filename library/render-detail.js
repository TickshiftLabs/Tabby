// RENDERING ONLY — right pane: selected snapshot
// Depends on: library/state.js, library/model.js, library/render-list.js, lib/dates.js

// Chrome tab group colours
const GROUP_COLORS = {
  grey: "#8a8f98",
  blue: "#4c8bf5",
  red: "#e5534b",
  yellow: "#e3a008",
  green: "#3fa45b",
  pink: "#e667af",
  purple: "#a06bf0",
  cyan: "#2cb5c9",
  orange: "#f08c3a",
};

function currentSnapshot() {
  return state.snapshots.find((s) => s.id === state.selectedId) || null;
}

// A tab's address without the scheme or "www.", for showing beside its title.
function displayAddress(url) {
  return String(url || "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
}

function tabRowHtml({ tab, index }) {
  const title = tab.title || tab.url || "Untitled";
  const group = tab.groupTitle
    ? `<span class="tab-group" style="--group-color:${GROUP_COLORS[tab.groupColor] || GROUP_COLORS.grey}">${escapeHtml(tab.groupTitle)}</span>`
    : "";

  return `
    <li class="tab" data-tab-index="${index}">
      ${faviconHtml(tab.favicon, tab.domain)}
      <a class="tab-title" href="${escapeHtml(tab.url || "")}" target="_blank" rel="noopener"
         title="${escapeHtml(tab.url || "")}" data-action="open-tab">${highlight(title, state.query)}</a>
      <span class="tab-url">${highlight(displayAddress(tab.url), state.query)}</span>
      ${group}
      <button class="quiet-btn tab-menu" data-action="tab-menu" title="More" aria-label="More actions">⋯</button>
    </li>`;
}

function renderDetail() {
  const detail = document.getElementById("detail");
  const snapshot = currentSnapshot();

  if (!snapshot) {
    detail.innerHTML = `<div class="detail-empty">Select a snapshot to see its tabs.</div>`;
    return;
  }

  const folder = state.folders.find((f) => f.id === snapshot.folderId);
  const meta = [
    tabCountLabel(snapshot.tabs.length),
    `saved ${formatDateTime(snapshot.createdAt)}`,
    folder ? folder.name : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  // While searching, show only matching tabs unless "show all" was chosen.
  const row = visibleSnapshots().find((r) => r.snapshot.id === snapshot.id);
  const matchIndices = row ? row.matchIndices : [];
  const filtered =
    state.query.trim() !== "" &&
    state.showAllFor !== snapshot.id &&
    matchIndices.length < snapshot.tabs.length;
  const groups = groupTabsByDomain(snapshot.tabs, filtered ? matchIndices : undefined);

  const groupsHtml = groups
    .map(
      (group) => `
      <h3 class="domain-heading">${highlight(group.domain, state.query)} · ${group.items.length}</h3>
      <ul class="tabs">${group.items.map(tabRowHtml).join("")}</ul>`
    )
    .join("");

  const filterNote = filtered
    ? `<p class="filter-note">Showing ${matchIndices.length} matching.
         <button class="link-btn" data-action="show-all-tabs">Show all ${tabCountLabel(snapshot.tabs.length)}</button></p>`
    : "";

  detail.innerHTML = `
    <header class="detail-head">
      <button class="detail-name" data-action="rename-snapshot" title="Rename">${escapeHtml(snapshotDisplayName(snapshot))}</button>
      <p class="detail-meta">${meta}</p>
      <div class="toolbar">
        <button class="btn btn-primary" data-action="restore-snapshot">Restore all</button>
        <button class="btn${snapshot.starred ? " on" : ""}" data-action="toggle-star"
                aria-pressed="${snapshot.starred ? "true" : "false"}">${snapshot.starred ? "★ Starred" : "☆ Star"}</button>
        <button class="btn" data-action="move-snapshot">Move to ▾</button>
        <button class="btn" data-action="snapshot-menu" title="More" aria-label="More actions">⋯</button>
      </div>
    </header>
    ${filterNote}
    ${groupsHtml}`;
}
