// POPUP UI — save the current window or tab, close duplicate tabs, and jump to recent snapshots
// Depends on: lib/urls.js, lib/dates.js, storage/dedup.js, storage/snapshots.js,
//             lib/domains.js (openTabsBySite), library/model.js, library/tidy-model.js,
//             library/open.js

const SITES_SHOWN = 5; // sites listed before "Show all"

let allSites = []; // [{domain, count, favicon}] across every window
let showAllSites = false;
let duplicateGroups = []; // [{url, keep, close}] pages open in more than one tab
let dupeStep = "idle"; // "idle" | "confirm" | "done"
let closedDuplicates = []; // tabs closed by the last clean-up, for Reopen
let windowTabs = []; // saveable tabs in the current window
let activeTab = null; // the current tab, if it can be saved

document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  setupButtons();
  await refresh();
});

// ── Theme ─────────────────────────────────────────────

function applyTheme(theme) {
  const resolved =
    theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", resolved);
}

async function initTheme() {
  const result = await chrome.storage.local.get("tabby_theme");
  applyTheme(result.tabby_theme);
}

async function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await chrome.storage.local.set({ tabby_theme: next });
}

// ── Reading the current state ─────────────────────────

function tabCountLabel(count) {
  return `${count} tab${count === 1 ? "" : "s"}`;
}

async function refresh() {
  const ownId = chrome.runtime.id;
  const currentWindow = await chrome.windows.getCurrent();
  const [tabsInWindow, allTabs, snapshots] = await Promise.all([
    chrome.tabs.query({ windowId: currentWindow.id }),
    chrome.tabs.query({}),
    getAllSnapshots(),
  ]);

  windowTabs = tabsInWindow.filter((tab) => isSaveableTab(tab, ownId));
  const current = tabsInWindow.find((tab) => tab.active);
  activeTab = current && isSaveableTab(current, ownId) ? current : null;

  allSites = openTabsBySite(allTabs);
  duplicateGroups = findDuplicateOpenTabs(allTabs, ownId);

  renderSaveButtons();
  renderDuplicates();
  renderSites();
  renderRecent(snapshots);
  renderSummary(allTabs, snapshots, ownId);
}

// ── Duplicate open tabs ───────────────────────────────

function extraTabs() {
  return duplicateGroups.flatMap((group) => group.close);
}

/**
 * The duplicate clean-up card: offer, then confirm once, then report with
 * a way to reopen. Pinned tabs and extension pages are never included.
 */
function renderDuplicates() {
  const box = document.getElementById("dupes");
  const extras = extraTabs();

  if (dupeStep === "done") {
    box.hidden = false;
    box.innerHTML = `
      <span class="dupes-text">Closed ${tabCountLabel(closedDuplicates.length)}</span>
      <span class="dupes-actions"><button class="chip" data-dupe="reopen">Reopen</button></span>`;
    return;
  }

  if (extras.length === 0) {
    box.hidden = true;
    box.innerHTML = "";
    dupeStep = "idle";
    return;
  }

  box.hidden = false;
  const pages = duplicateGroups.length;

  if (dupeStep === "confirm") {
    box.innerHTML = `
      <span class="dupes-text">Close ${tabCountLabel(extras.length)}? One tab stays open for each page.</span>
      <span class="dupes-actions">
        <button class="chip" data-dupe="cancel">Cancel</button>
        <button class="chip chip-primary" data-dupe="close">Close</button>
      </span>`;
    box.querySelector('[data-dupe="cancel"]').focus();
    return;
  }

  box.innerHTML = `
    <span class="dupes-text">${pages} page${pages === 1 ? " is" : "s are"} open more than once</span>
    <span class="dupes-actions">
      <button class="chip" data-dupe="ask">Close ${extras.length} duplicate${extras.length === 1 ? "" : "s"}</button>
    </span>`;
}

async function closeDuplicates() {
  // Look again first, so a tab that changed since the popup opened is kept.
  const fresh = findDuplicateOpenTabs(await chrome.tabs.query({}), chrome.runtime.id);
  const toClose = tabsStillListed(extraTabs(), fresh.flatMap((group) => group.close));

  try {
    if (toClose.length > 0) await chrome.tabs.remove(toClose.map((tab) => tab.id));
    closedDuplicates = toClose;
    dupeStep = toClose.length > 0 ? "done" : "idle";
  } catch (err) {
    console.error("[Tabby] Could not close duplicate tabs:", err);
    dupeStep = "idle";
  }
  await refresh();
}

async function reopenDuplicates() {
  for (const tab of closedDuplicates) {
    const url = getTabUrl(tab);
    if (!url) continue;
    try {
      await chrome.tabs.create({ url, windowId: tab.windowId, active: false });
    } catch {
      await chrome.tabs.create({ url, active: false }).catch(() => {});
    }
  }
  closedDuplicates = [];
  dupeStep = "idle";
  await refresh();
}

function setupDuplicates() {
  document.getElementById("dupes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-dupe]");
    if (!button) return;
    const action = button.dataset.dupe;

    if (action === "ask") dupeStep = "confirm";
    if (action === "cancel") dupeStep = "idle";
    if (action === "ask" || action === "cancel") renderDuplicates();
    if (action === "close") closeDuplicates();
    if (action === "reopen") reopenDuplicates();
  });
}

function siteRowHtml(site) {
  const initial = escapeHtml(site.domain.charAt(0).toUpperCase());
  // A broken image is swapped for the initial by the error listener below.
  const icon = site.favicon
    ? `<img class="fav" src="${escapeHtml(site.favicon)}" data-initial="${initial}" alt="">`
    : `<span class="fav fav-initial">${initial}</span>`;
  return `
    <div class="site-row">
      ${icon}
      <span class="site-name" title="${escapeHtml(site.domain)}">${escapeHtml(site.domain)}</span>
      <span class="site-count">${site.count}</span>
    </div>`;
}

function renderSites() {
  const shown = showAllSites ? allSites : allSites.slice(0, SITES_SHOWN);
  const more = document.getElementById("sites-more");

  document.getElementById("sites").hidden = allSites.length === 0;
  document.getElementById("site-list").innerHTML = shown.map(siteRowHtml).join("");

  more.hidden = allSites.length <= SITES_SHOWN;
  more.textContent = showAllSites ? "Show fewer" : `Show all ${allSites.length} sites`;
}

function renderSaveButtons() {
  const saveWindow = document.getElementById("save-window");
  const saveTab = document.getElementById("save-tab");

  if (windowTabs.length === 0) {
    saveWindow.disabled = true;
    saveWindow.textContent = "Nothing to save in this window";
  } else {
    saveWindow.disabled = false;
    saveWindow.textContent = `Save this window · ${tabCountLabel(windowTabs.length)}`;
  }

  saveTab.disabled = !activeTab;
  saveTab.textContent = "Save just this tab";
}

function renderRecent(snapshots) {
  const recent = sortSnapshots(
    snapshots.filter((s) => Array.isArray(s.tabs) && s.tabs.length > 0),
    "recent"
  ).slice(0, 3);

  document.getElementById("recent").hidden = recent.length === 0;
  document.getElementById("recent-list").innerHTML = recent
    .map(
      (snapshot) => `
      <button class="recent-row" data-snapshot-id="${escapeHtml(snapshot.id)}">
        <span class="recent-name">${escapeHtml(snapshotDisplayName(snapshot))}</span>
        <span class="recent-when">${escapeHtml(formatRelativeDate(snapshot.createdAt))}</span>
      </button>`
    )
    .join("");
}

function renderSummary(allTabs, snapshots, ownId) {
  const saved = findAlreadySavedTabs(allTabs, snapshots, ownId).length;
  const parts = [`${allTabs.length} open`];
  if (saved > 0) parts.push(`${saved} already saved`);
  document.getElementById("open-summary").textContent = parts.join(" · ");
}

// ── Actions ───────────────────────────────────────────

async function openLibrary(snapshotId) {
  await openLibraryTab(snapshotId);
  window.close();
}

/**
 * Save tabs, then show the outcome on the button for a moment.
 */
async function saveAndReport(button, tabs, reason) {
  if (tabs.length === 0) return;
  button.disabled = true;

  let label;
  try {
    await enrichTabsWithGroupInfo(tabs);
    const snapshot = await saveSnapshot(tabs, reason);
    if (!snapshot) label = "Nothing to save";
    else if (snapshot.isDuplicate) label = "Already saved";
    else label = `Saved ${tabCountLabel(snapshot.tabs.length)}`;
  } catch (err) {
    console.error("[Tabby] Save failed:", err);
    label = "Could not save. Please try again";
  }

  button.textContent = label;
  await refreshRecentOnly();
  setTimeout(renderSaveButtons, 2000);
}

async function refreshRecentOnly() {
  const snapshots = await getAllSnapshots();
  renderRecent(snapshots);
  renderSummary(await chrome.tabs.query({}), snapshots, chrome.runtime.id);
}

function setupButtons() {
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  setupDuplicates();

  document.getElementById("save-window").addEventListener("click", (event) => {
    saveAndReport(event.currentTarget, windowTabs, "popup-window");
  });

  document.getElementById("save-tab").addEventListener("click", (event) => {
    if (activeTab) saveAndReport(event.currentTarget, [activeTab], "popup-tab");
  });

  document.getElementById("open-library").addEventListener("click", () => openLibrary());

  document.getElementById("sites-more").addEventListener("click", () => {
    showAllSites = !showAllSites;
    renderSites();
  });

  // Inline onerror handlers are not allowed here, so broken site icons are
  // caught on the way up and replaced with the site's initial.
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

  document.getElementById("recent-list").addEventListener("click", (event) => {
    const row = event.target.closest(".recent-row");
    if (row) openLibrary(row.dataset.snapshotId);
  });
}
