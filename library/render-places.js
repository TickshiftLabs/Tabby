// RENDERING ONLY — left pane: places
// Depends on: library/state.js, library/model.js

function isActivePlace(type, folderId) {
  if (state.place.type !== type) return false;
  return type !== "folder" || state.place.folderId === folderId;
}

function placeRowHtml({ type, folderId, label, count, glyph }) {
  const active = isActivePlace(type, folderId) ? " active" : "";
  const folderAttr = folderId ? ` data-folder-id="${escapeHtml(folderId)}"` : "";
  const countHtml = count ? `<span class="place-count">${count}</span>` : "";
  // Shown instead of the label when the sidebar is collapsed.
  const initial = escapeHtml(glyph || (label || "?").trim().charAt(0).toUpperCase());
  return `
    <button class="place${active}" data-action="select-place" data-place-type="${type}"${folderAttr}
            data-initial="${initial}" title="${escapeHtml(label)}">
      <span class="place-label">${escapeHtml(label)}</span>
      ${countHtml}
    </button>`;
}

function placeLabel(place) {
  if (place.type === "starred") return "Starred";
  if (place.type === "trash") return "Trash";
  if (place.type === "tidy") return "Tidy up";
  if (place.type === "folder") {
    const folder = state.folders.find((f) => f.id === place.folderId);
    return folder ? folder.name : "Folder";
  }
  return "All snapshots";
}

function renderPlaces() {
  const counts = placeCounts(state.snapshots, state.folders);

  const folderRows = state.folders
    .map((folder) =>
      placeRowHtml({ type: "folder", folderId: folder.id, label: folder.name, count: counts.folders[folder.id] })
    )
    .join("");

  document.getElementById("places").innerHTML = `
    ${placeRowHtml({ type: "all", label: "All snapshots", count: counts.all, glyph: "≡" })}
    ${placeRowHtml({ type: "starred", label: "Starred", count: counts.starred, glyph: "★" })}
    <div class="places-heading">
      <span>Folders</span>
      <button class="quiet-btn" data-action="add-folder" title="New folder">+</button>
    </div>
    ${folderRows || `<div class="places-hint">No folders yet</div>`}
    <div class="places-gap"></div>
    ${placeRowHtml({ type: "tidy", label: "Tidy up", count: tidyCount(), glyph: "✓" })}
    ${placeRowHtml({ type: "trash", label: "Trash", count: state.trash.length, glyph: "×" })}
  `;
}
