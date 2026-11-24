// BACKGROUND ACTIONS — save operations and validation
// Depends on: lib/urls.js (isSaveableTab), storage/dedup.js, storage/snapshots.js (saveSnapshot)

async function saveThisTab(tab) {
  if (!isSaveableTab(tab, chrome.runtime.id)) {
    showNotification("Cannot save this tab", "Browser internal pages cannot be saved.");
    return;
  }

  await enrichTabsWithGroupInfo([tab]);
  const snapshot = await saveSnapshot([tab], "context-menu-tab");
  if (!snapshot) {
    showNotification("No tabs to save", "Nothing to save.");
    return;
  }
  if (snapshot.isDuplicate) {
    showNotification("Already saved", "This tab is already in your vault.");
  } else {
    showNotification("Tab saved", `Saved "${tab.title}" to Tabby`);
  }
}

async function saveThisWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });

  const validTabs = tabs.filter((tab) => isSaveableTab(tab, chrome.runtime.id));

  if (validTabs.length === 0) {
    showNotification("No tabs to save", "This window has no saveable tabs.");
    return;
  }

  await enrichTabsWithGroupInfo(validTabs);
  const snapshot = await saveSnapshot(validTabs, "context-menu-window");
  if (!snapshot) {
    showNotification("No tabs to save", "Nothing to save.");
    return;
  }
  if (snapshot.isDuplicate) {
    showNotification("Already saved", "These tabs are already in your vault.");
  } else {
    showNotification("Window saved", `Saved ${snapshot.tabs.length} tabs to Tabby`);
  }
}

function showNotification(title, message) {
  // Use badge text as visual feedback since it's always visible
  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#4a7c59" });

  // Clear badge after 2 seconds
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 2000);

  // Also log for debugging
  console.log(`[Tabby] ${title}: ${message}`);
}
