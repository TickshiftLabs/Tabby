// BACKGROUND INITIALIZATION — service worker entry point
// Depends on: background/contextMenu.js, storage/cleanup.js

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  cleanupRetiredKeys().catch((err) => console.warn("[Tabby] Storage cleanup failed:", err));
});

// Setup click handlers immediately (they need to be registered for the menu to work)
setupContextMenuHandlers();
