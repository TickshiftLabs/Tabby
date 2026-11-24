// CONTEXT MENU — menu creation and click handling
// Depends on: background/actions.js (saveThisTab, saveThisWindow)

function setupContextMenus() {
  // Menus persist across extension updates. Start clean so removed items
  // disappear and existing ones are not created twice.
  chrome.contextMenus.removeAll(createContextMenus);
}

function createContextMenus() {
  // Context menu items - order of creation determines display order

  // 1. Open Tabby (appears in both action button and page context)
  chrome.contextMenus.create({
    id: "open-tabby",
    title: "Open Tabby",
    contexts: ["action", "page"],
  });

  // 2. Separator (page context only)
  chrome.contextMenus.create({
    id: "tabby-separator",
    type: "separator",
    contexts: ["page"],
  });

  // 3. Save this tab
  chrome.contextMenus.create({
    id: "save-this-tab",
    title: "Save this tab to Tabby",
    contexts: ["page"],
  });

  // 4. Save this window
  chrome.contextMenus.create({
    id: "save-this-window",
    title: "Save this window to Tabby",
    contexts: ["page"],
  });
}

function setupContextMenuHandlers() {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "open-tabby") {
      await openLibraryTab();
      return;
    }

    if (info.menuItemId === "save-this-tab") {
      await saveThisTab(tab);
      return;
    }

    if (info.menuItemId === "save-this-window") {
      await saveThisWindow(tab.windowId);
      return;
    }
  });
}
