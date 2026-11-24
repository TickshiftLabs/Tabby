// TIDY UP — close open tabs that are already saved or open twice
// Depends on: library/tidy-model.js, library/state.js, library/dialogs.js, library/actions.js

const tidy = {
  saved: [], // open tabs already in a snapshot
  duplicates: [], // [{url, keep, close: []}]
};

let tidyShown = null; // signature of the result last rendered

async function computeTidy() {
  const openTabs = await chrome.tabs.query({});
  const ownId = chrome.runtime.id;
  return {
    saved: findAlreadySavedTabs(openTabs, state.snapshots, ownId),
    duplicates: findDuplicateOpenTabs(openTabs, ownId),
  };
}

/**
 * Re-read open tabs and work out what could be tidied. Re-renders only
 * when the result changed, and only what shows it.
 */
async function refreshTidy() {
  const fresh = await computeTidy();
  tidy.saved = fresh.saved;
  tidy.duplicates = fresh.duplicates;

  const signature = tidySignature(tidy.saved, tidy.duplicates);
  if (signature === tidyShown) return;
  tidyShown = signature;

  if (state.place.type === "tidy") renderAll();
  else renderPlaces();
}

function duplicateCloseTabs() {
  return tidy.duplicates.flatMap((group) => group.close);
}

// Number shown beside "Tidy up": each tab counted once.
function tidyCount() {
  const ids = new Set([...tidy.saved, ...duplicateCloseTabs()].map((tab) => tab.id));
  return ids.size;
}

function tidyTabLine(tab) {
  return `<li title="${escapeHtml(getTabUrl(tab) || "")}">${escapeHtml(tab.title || getTabUrl(tab) || "Untitled")}</li>`;
}

function tidyCardHtml({ summary, tabs, buttonLabel, action }) {
  if (tabs.length === 0) {
    return `<section class="card"><p class="card-done">${summary}</p></section>`;
  }
  return `
    <section class="card">
      <p class="card-summary">${summary}</p>
      <details>
        <summary>Show ${tabCountLabel(tabs.length)}</summary>
        <ul>${tabs.map(tidyTabLine).join("")}</ul>
      </details>
      <button class="btn btn-primary" data-action="${action}">${buttonLabel}</button>
    </section>`;
}

function renderTidy() {
  const saved = tidy.saved;
  const extras = duplicateCloseTabs();
  const pages = tidy.duplicates.length;

  const savedSummary =
    saved.length === 0
      ? "No open tabs are waiting here. Tabs you have saved show up here while they are still open."
      : saved.length === 1
        ? "1 open tab is already saved, so it is safe to close."
        : `${saved.length} open tabs are already saved, so they are safe to close.`;

  const duplicateSummary =
    pages === 0
      ? "No page is open more than once."
      : pages === 1
        ? "1 page is open more than once."
        : `${pages} pages are open more than once.`;

  document.getElementById("detail").innerHTML = `
    <div class="tidy">
      <h1>Tidy up</h1>
      <p>Close open tabs you no longer need open. Nothing you have saved is removed, and pinned tabs are left alone.</p>
      ${tidyCardHtml({
        summary: savedSummary,
        tabs: saved,
        buttonLabel: `Close ${tabCountLabel(saved.length)}`,
        action: "close-saved-tabs",
      })}
      ${tidyCardHtml({
        summary: duplicateSummary,
        tabs: extras,
        buttonLabel: `Close ${extras.length} extra tab${extras.length === 1 ? "" : "s"}`,
        action: "close-duplicate-tabs",
      })}
    </div>`;
}

/**
 * Reopen closed tabs in the window they were in, or the current one if
 * that window is gone.
 */
async function reopenTabs(tabs) {
  for (const tab of tabs) {
    const url = getTabUrl(tab);
    if (!url) continue;
    try {
      await chrome.tabs.create({ url, windowId: tab.windowId, active: false });
    } catch {
      await chrome.tabs.create({ url, active: false }).catch(() => {});
    }
  }
  await refreshTidy();
}

/**
 * Confirm once, then close the planned tabs that are still on a freshly
 * computed list, so a tab that changed while the dialog was open is kept.
 * @param {Function} pick - (tidyResult) => tabs to close
 */
async function closeTabsAfterConfirm(pick, message) {
  const planned = pick(tidy);
  if (planned.length === 0) return;

  const label = `Close ${tabCountLabel(planned.length)}`;
  const confirmed = await showConfirmDialog(`${label}?`, message, label);
  if (!confirmed) return;

  const toClose = tabsStillListed(planned, pick(await computeTidy()));
  try {
    if (toClose.length > 0) await chrome.tabs.remove(toClose.map((tab) => tab.id));
    showToastWithAction(`Closed ${tabCountLabel(toClose.length)}`, toClose.length > 0 ? "Reopen" : null, () =>
      reopenTabs(toClose)
    );
  } catch (err) {
    console.warn("[Tabby] Could not close tabs:", err);
    showToast("Some tabs could not be closed");
  }
  await refreshTidy();
}

ACTIONS["close-saved-tabs"] = () =>
  closeTabsAfterConfirm(
    (result) => result.saved,
    "These tabs are already saved in Tabby. The saved copies stay where they are."
  );

ACTIONS["close-duplicate-tabs"] = () =>
  closeTabsAfterConfirm(
    (result) => result.duplicates.flatMap((group) => group.close),
    "One tab stays open for each page. Only the extra copies are closed."
  );

function setupTidy() {
  // Open tabs change while this page is in the background.
  window.addEventListener("focus", () => {
    refreshTidy();
  });
}
