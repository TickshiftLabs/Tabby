// BACKGROUND ACTIONS — save operations started from the right-click menu
// Depends on: lib/urls.js (isSaveableTab), storage/dedup.js, storage/snapshots.js (saveSnapshot)

async function saveThisTab(tab) {
  if (!isSaveableTab(tab, chrome.runtime.id)) {
    showSaveResult(false, "This page can't be saved");
    return;
  }

  await enrichTabsWithGroupInfo([tab]);
  const snapshot = await saveSnapshot([tab], "context-menu-tab");
  if (!snapshot) {
    showSaveResult(false, "Nothing to save");
  } else if (snapshot.isDuplicate) {
    showSaveResult(true, "Already saved");
  } else {
    showSaveResult(true, "Saved 1 tab");
  }
}

async function saveThisWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const validTabs = tabs.filter((tab) => isSaveableTab(tab, chrome.runtime.id));

  if (validTabs.length === 0) {
    showSaveResult(false, "Nothing to save in this window");
    return;
  }

  await enrichTabsWithGroupInfo(validTabs);
  const snapshot = await saveSnapshot(validTabs, "context-menu-window");
  if (!snapshot) {
    showSaveResult(false, "Nothing to save in this window");
  } else if (snapshot.isDuplicate) {
    showSaveResult(true, "Already saved");
  } else {
    const count = snapshot.tabs.length;
    showSaveResult(true, `Saved ${count} tab${count === 1 ? "" : "s"}`);
  }
}

/**
 * Show the outcome on the toolbar button, since there is no page to show it
 * on: a green tick when the tabs are safely stored, an amber "!" when
 * nothing was saved. The reason is the button's tooltip until it clears.
 */
function showSaveResult(saved, message) {
  chrome.action.setBadgeText({ text: saved ? "✓" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: saved ? "#4a7c59" : "#b7791f" });
  chrome.action.setTitle({ title: `Tabby — ${message}` });

  setTimeout(
    () => {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Tabby" });
    },
    saved ? 2000 : 4000
  );
}
