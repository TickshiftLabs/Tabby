// PURE FUNCTIONS ONLY — no DOM, no chrome APIs
// Tidy up: which open tabs are safe to close.
// Depends on: lib/urls.js (isSaveableTab, getTabUrl, normalizeUrlForDedup)

// Pinned tabs are kept open on purpose, so they are never offered for closing.
// Extension pages are never offered either, even ones that wrap a web page
// (viewers, suspended tabs): closing them is not ours to suggest.
function isTidyCandidate(tab, ownExtensionId) {
  if (tab.pinned) return false;
  const rawUrl = tab.url || tab.pendingUrl || "";
  if (rawUrl.startsWith("chrome-extension://")) return false;
  return isSaveableTab(tab, ownExtensionId);
}

function tidyUrl(tab) {
  return normalizeUrlForDedup(getTabUrl(tab));
}

/**
 * Open tabs whose page is already in a snapshot.
 */
function findAlreadySavedTabs(openTabs, snapshots, ownExtensionId) {
  const savedUrls = new Set();
  for (const snapshot of snapshots) {
    for (const tab of Array.isArray(snapshot.tabs) ? snapshot.tabs : []) {
      savedUrls.add(normalizeUrlForDedup(tab.url));
    }
  }
  return openTabs.filter((tab) => isTidyCandidate(tab, ownExtensionId) && savedUrls.has(tidyUrl(tab)));
}

/**
 * Pages open in more than one tab. `keep` is the active tab if there is
 * one, otherwise the most recently used; `close` is the rest.
 */
function findDuplicateOpenTabs(openTabs, ownExtensionId) {
  const byUrl = new Map();
  for (const tab of openTabs) {
    if (!isTidyCandidate(tab, ownExtensionId)) continue;
    const url = tidyUrl(tab);
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(tab);
  }

  const groups = [];
  for (const [url, tabs] of byUrl) {
    if (tabs.length < 2) continue;
    const ranked = [...tabs].sort((a, b) => {
      if (Boolean(a.active) !== Boolean(b.active)) return a.active ? -1 : 1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
    groups.push({ url, keep: ranked[0], close: ranked.slice(1) });
  }
  return groups;
}

/**
 * The planned tabs that are still on a freshly computed list, so a tab that
 * changed in the meantime is never closed.
 */
function tabsStillListed(planned, fresh) {
  const freshIds = new Set(fresh.map((tab) => tab.id));
  return planned.filter((tab) => freshIds.has(tab.id));
}

/**
 * A string that changes exactly when the tidy result changes.
 */
function tidySignature(saved, duplicates) {
  return JSON.stringify([
    saved.map((tab) => tab.id),
    duplicates.map((group) => [group.url, group.keep.id, group.close.map((tab) => tab.id)]),
  ]);
}
