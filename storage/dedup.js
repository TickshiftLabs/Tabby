// STORAGE LAYER — deduplication logic
// Depends on: lib/urls.js (getTabUrl, normalizeUrlForDedup), lib/domains.js (extractDomain)

/**
 * Create a normalized tab entry from a Chrome tab object
 * @param {Object} tab - Chrome tab object
 * @returns {Object} TabEntry
 */
function createTabEntry(tab) {
  // Use getTabUrl to handle normal, discarded, and extension-suspended tabs
  const url = getTabUrl(tab) || tab.url;
  const entry = {
    url: url,
    title: tab.title || "Untitled",
    domain: extractDomain(url) || "",
    favicon: tab.favIconUrl || "",
    windowId: tab.windowId,
    pinned: Boolean(tab.pinned),
  };

  // Include tab group info if present (set by enrichTabsWithGroupInfo)
  if (tab._groupTitle) entry.groupTitle = tab._groupTitle;
  if (tab._groupColor) entry.groupColor = tab._groupColor;

  return entry;
}

/**
 * Enrich Chrome tab objects with tab group title and color.
 * Adds _groupTitle and _groupColor properties to each tab.
 * @param {Array} tabs - Array of Chrome tab objects
 * @returns {Array} Same tabs with group info added
 */
async function enrichTabsWithGroupInfo(tabs) {
  if (!chrome.tabGroups || !chrome.tabGroups.get) return tabs;

  const groupCache = new Map();

  for (const tab of tabs) {
    if (tab.groupId && tab.groupId !== -1) {
      if (!groupCache.has(tab.groupId)) {
        try {
          const group = await chrome.tabGroups.get(tab.groupId);
          groupCache.set(tab.groupId, { title: group.title || "", color: group.color || "" });
        } catch {
          groupCache.set(tab.groupId, null);
        }
      }
      const info = groupCache.get(tab.groupId);
      if (info) {
        tab._groupTitle = info.title;
        tab._groupColor = info.color;
      }
    }
  }

  return tabs;
}

/**
 * Remove duplicate tabs within a collection based on normalized URL
 * @param {Array} tabEntries - Array of tab entry objects
 * @returns {Array} Deduplicated array
 */
function deduplicateTabs(tabEntries) {
  const seen = new Set();
  return tabEntries.filter((tab) => {
    const normalizedUrl = normalizeUrlForDedup(tab.url);
    if (seen.has(normalizedUrl)) {
      return false;
    }
    seen.add(normalizedUrl);
    return true;
  });
}

/**
 * Check if two snapshots have identical URLs
 * @param {Array} tabsA - First set of tabs
 * @param {Array} tabsB - Second set of tabs
 * @returns {boolean}
 */
function snapshotsHaveSameUrls(tabsA, tabsB) {
  if (tabsA.length !== tabsB.length) return false;

  const urlsA = new Set(tabsA.map((t) => normalizeUrlForDedup(t.url)));
  const urlsB = new Set(tabsB.map((t) => normalizeUrlForDedup(t.url)));

  if (urlsA.size !== urlsB.size) return false;

  for (const url of urlsA) {
    if (!urlsB.has(url)) return false;
  }
  return true;
}
