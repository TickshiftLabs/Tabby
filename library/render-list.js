// RENDERING ONLY — middle pane: snapshot list
// Depends on: library/state.js, library/model.js, lib/dates.js

/**
 * Snapshots shown in the list: place filter, then sort, then search.
 * @returns {Array<{snapshot: Object, matchIndices: number[]}>}
 */
function visibleSnapshots() {
  const inPlace = snapshotsForPlace(state.snapshots, state.folders, state.place);
  return searchSnapshots(sortSnapshots(inPlace, state.sort), state.query);
}

function faviconHtml(favicon, domain) {
  const initial = escapeHtml((domain || "?").charAt(0).toUpperCase());
  if (!favicon) return `<span class="fav fav-initial">${initial}</span>`;
  // A broken image is swapped for the initial by the error listener in init.js.
  return `<img class="fav" src="${escapeHtml(favicon)}" data-initial="${initial}" alt="" loading="lazy">`;
}

function tabCountLabel(count) {
  return `${count} tab${count === 1 ? "" : "s"}`;
}

function snapshotRowHtml({ snapshot, matchIndices }) {
  const selected = snapshot.id === state.selectedId ? " selected" : "";
  const total = snapshot.tabs.length;
  const searching = state.query.trim() !== "";
  const countText =
    searching && matchIndices.length < total ? `${matchIndices.length} of ${tabCountLabel(total)}` : tabCountLabel(total);
  const icons = siteIcons(snapshot)
    .map((icon) => faviconHtml(icon.favicon, icon.domain))
    .join("");
  const star = snapshot.starred ? `<span class="row-star" title="Starred">★</span>` : "";

  return `
    <button class="row${selected}" data-action="select-snapshot" data-id="${escapeHtml(snapshot.id)}">
      <span class="row-name">${star}${highlight(snapshotDisplayName(snapshot), state.query)}</span>
      <span class="row-meta">
        <span>${countText} · ${escapeHtml(formatRelativeDate(snapshot.createdAt))}</span>
        <span class="icon-stack">${icons}</span>
      </span>
    </button>`;
}

function renderList() {
  const title = document.getElementById("list-title");
  const sortBtn = document.getElementById("sort");
  const list = document.getElementById("list");

  title.textContent = placeLabel(state.place);

  if (state.place.type === "trash") {
    sortBtn.hidden = true;
    renderTrashList(list);
    return;
  }

  sortBtn.hidden = false;
  sortBtn.textContent = state.sort === "alpha" ? "A–Z" : "Recent first";
  sortBtn.title = "Change sort order";

  const rows = visibleSnapshots();
  if (rows.length === 0) {
    const query = state.query.trim();
    list.innerHTML = query
      ? `<div class="list-empty">No saved tabs match “${escapeHtml(query)}”.</div>`
      : `<div class="list-empty">Nothing here yet.</div>`;
    return;
  }

  list.innerHTML = rows.map(snapshotRowHtml).join("");
}
