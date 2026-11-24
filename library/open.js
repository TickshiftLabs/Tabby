// OPEN THE LIBRARY — shared by the popup and the background worker
// Depends on: chrome.tabs, chrome.windows, chrome.runtime

/**
 * Show the Library: switch to its tab if one is open, otherwise open one.
 * With a snapshotId, the Library opens on that snapshot.
 */
async function openLibraryTab(snapshotId) {
  const base = chrome.runtime.getURL("library.html");
  const url = snapshotId ? `${base}#snapshot=${encodeURIComponent(snapshotId)}` : base;

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => typeof tab.url === "string" && tab.url.split("#")[0] === base);

  if (!existing) {
    await chrome.tabs.create({ url });
    return;
  }

  // Changing only the #hash does not reload the page; the Library listens for it.
  await chrome.tabs.update(existing.id, snapshotId ? { active: true, url } : { active: true });
  await chrome.windows.update(existing.windowId, { focused: true });
}
