// STORAGE LAYER — one-time removal of keys left behind by retired features
// Depends on: chrome.storage.local

// Derived data, UI preferences and settings of features that no longer exist.
// None of these hold anything a person saved.
const RETIRED_KEYS = ["tabby_tab_activity", "tabby_sidebar_prefs", "openrouterApiKey", "openrouterModel"];

/**
 * Remove storage keys that nothing reads any more.
 * @returns {Promise<string[]>} the keys that were removed
 */
async function cleanupRetiredKeys() {
  const stored = await chrome.storage.local.get(RETIRED_KEYS);
  const toRemove = RETIRED_KEYS.filter((key) => key in stored);

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }
  return toRemove;
}
