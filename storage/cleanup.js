// STORAGE LAYER — one-time removal of keys left behind by retired features
// Depends on: chrome.storage.local

// Derived or UI-only data from features that no longer exist.
// The last two are the settings of the removed naming feature, one of which
// was a key for a remote service.
const RETIRED_KEYS = ["tabby_tab_activity", "tabby_sidebar_prefs", "openrouterApiKey", "openrouterModel"];
const SECRET_KEYS = ["tabby_secret_config", "tabby_secret_snapshots"];

/**
 * Remove storage keys that nothing reads any more. The Secret Vault keys
 * are only removed when it holds no snapshots, so nothing a person
 * saved is ever deleted here.
 * @returns {Promise<string[]>} the keys that were removed
 */
async function cleanupRetiredKeys() {
  const stored = await chrome.storage.local.get([...RETIRED_KEYS, ...SECRET_KEYS]);

  const toRemove = RETIRED_KEYS.filter((key) => key in stored);

  const secretSnapshots = stored.tabby_secret_snapshots;
  const secretVaultEmpty = !Array.isArray(secretSnapshots) || secretSnapshots.length === 0;
  if (secretVaultEmpty) {
    toRemove.push(...SECRET_KEYS.filter((key) => key in stored));
  }

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }
  return toRemove;
}
