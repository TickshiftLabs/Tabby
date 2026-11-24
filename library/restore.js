// BROWSER ACTIONS — open saved tabs and snapshots
// Depends on: chrome.tabs, chrome.windows, chrome.tabGroups

/**
 * Open one saved tab in the current window.
 */
async function openTab(url, pinned = false) {
  return chrome.tabs.create({ url, pinned: Boolean(pinned), active: true });
}

/**
 * Open a whole snapshot in a new window, recreating saved tab groups.
 */
async function restoreSnapshotWithGroup(snapshot) {
  const tabs = snapshot?.tabs || [];
  if (tabs.length === 0) return;

  const displayName = snapshot.customName || snapshot.name || "Restored Snapshot";

  const pinnedTabs = tabs.filter((t) => t.pinned);
  const unpinnedTabs = tabs.filter((t) => !t.pinned);

  // Create window with first unpinned tab if possible (for grouping)
  const firstTab = unpinnedTabs[0] || pinnedTabs[0];
  const newWindow = await chrome.windows.create({ url: firstTab.url });

  // Track tab ID and its saved group info
  const tabIdMap = []; // { tabId, groupTitle, groupColor }

  if (newWindow.tabs && newWindow.tabs[0]) {
    const firstTabId = newWindow.tabs[0].id;
    if (firstTab.pinned) {
      await chrome.tabs.update(firstTabId, { pinned: true });
    } else {
      tabIdMap.push({ tabId: firstTabId, groupTitle: firstTab.groupTitle || null, groupColor: firstTab.groupColor || null });
    }
  }

  // Add remaining unpinned tabs
  for (let i = 1; i < unpinnedTabs.length; i++) {
    const tab = await chrome.tabs.create({ windowId: newWindow.id, url: unpinnedTabs[i].url });
    if (tab && tab.id) {
      tabIdMap.push({ tabId: tab.id, groupTitle: unpinnedTabs[i].groupTitle || null, groupColor: unpinnedTabs[i].groupColor || null });
    }
  }

  // Add pinned tabs (not grouped)
  for (const tab of pinnedTabs) {
    if (tab === firstTab && tab.pinned) continue;
    await chrome.tabs.create({ windowId: newWindow.id, url: tab.url, pinned: true });
  }

  // Group tabs
  if (tabIdMap.length > 0 && chrome.tabs.group && chrome.tabGroups?.update) {
    try {
      // Check if any tabs have saved group info
      const hasSavedGroups = tabIdMap.some((t) => t.groupTitle);

      if (hasSavedGroups) {
        // Recreate original tab groups by groupTitle
        const groupsByTitle = new Map();
        const ungroupedIds = [];
        for (const t of tabIdMap) {
          if (t.groupTitle) {
            if (!groupsByTitle.has(t.groupTitle)) {
              groupsByTitle.set(t.groupTitle, { color: t.groupColor, tabIds: [] });
            }
            groupsByTitle.get(t.groupTitle).tabIds.push(t.tabId);
          } else {
            ungroupedIds.push(t.tabId);
          }
        }

        for (const [title, info] of groupsByTitle) {
          const groupId = await chrome.tabs.group({ tabIds: info.tabIds });
          const updateProps = { title };
          if (info.color) updateProps.color = info.color;
          await chrome.tabGroups.update(groupId, updateProps);
        }
        // ungrouped tabs remain ungrouped
      } else {
        // Fallback: one group per snapshot (legacy behavior)
        const allTabIds = tabIdMap.map((t) => t.tabId);
        const groupId = await chrome.tabs.group({ tabIds: allTabIds });
        await chrome.tabGroups.update(groupId, { title: displayName, color: "grey" });
      }
    } catch {
      // Fail silently; restore should still succeed
    }
  }
}
