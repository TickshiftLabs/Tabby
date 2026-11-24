// PURE FUNCTIONS ONLY — no side effects, no DOM, no chrome APIs

/**
 * Check if a URL is a valid web URL (http or https)
 * @param {string} url
 * @returns {boolean}
 */
function isWebUrl(url) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Extract original URL from extension-suspended tabs (e.g., The Great Suspender)
 * These have URLs like: chrome-extension://xxx/suspended.html?url=https://...
 * @param {string} url
 * @returns {string|null}
 */
function extractUrlFromExtension(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);

    if (urlObj.protocol !== "chrome-extension:") {
      return url;
    }

    // Common parameter names used by various tab suspenders
    const paramKeys = [
      "url", "uri", "u",
      "originalUrl", "original_url", "originalurl",
      "target", "dest", "destination",
      "src", "source", "link", "href",
      "tabUrl", "tab_url", "taburl",
      "page", "pageUrl", "page_url"
    ];

    // Check query params (most common)
    const params = urlObj.searchParams;
    for (const key of paramKeys) {
      const value = params.get(key);
      if (value) {
        try {
          const decoded = decodeURIComponent(value);
          if (isWebUrl(decoded)) {
            return decoded;
          }
        } catch {
          // Continue to next param
        }
      }
    }

    // Check hash fragment (some suspenders use #url=...)
    if (urlObj.hash && urlObj.hash.length > 1) {
      try {
        const hashParams = new URLSearchParams(urlObj.hash.slice(1));
        for (const key of paramKeys) {
          const value = hashParams.get(key);
          if (value) {
            try {
              const decoded = decodeURIComponent(value);
              if (isWebUrl(decoded)) {
                return decoded;
              }
            } catch {
              // Continue to next param
            }
          }
        }
      } catch {
        // Hash wasn't valid params format
      }
    }

    // Last resort: look for any http(s) URL in the entire query string
    const fullSearch = urlObj.search + urlObj.hash;
    const httpMatch = fullSearch.match(/https?:\/\/[^\s&"'<>]+/i);
    if (httpMatch) {
      try {
        return decodeURIComponent(httpMatch[0]);
      } catch {
        return httpMatch[0];
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the best available URL for a tab object
 * Handles: Chrome-native discarded tabs, normal tabs, extension-suspended tabs
 * @param {Object} tab - Chrome tab object with url, pendingUrl properties
 * @returns {string|null}
 */
function getTabUrl(tab) {
  // Priority 1: pendingUrl if it's a valid web URL
  // (Chrome uses this for discarded tabs)
  if (tab.pendingUrl && isWebUrl(tab.pendingUrl)) {
    return tab.pendingUrl;
  }

  // Priority 2: tab.url if it's already a valid web URL
  if (tab.url && isWebUrl(tab.url)) {
    return tab.url;
  }

  // Priority 3: Extract from extension URL (suspended tabs)
  if (tab.url && tab.url.startsWith("chrome-extension://")) {
    const extracted = extractUrlFromExtension(tab.url);
    if (extracted && isWebUrl(extracted)) {
      return extracted;
    }
  }

  // Priority 4: pendingUrl even if not http(s) (might be file:// etc.)
  if (tab.pendingUrl) {
    return tab.pendingUrl;
  }

  // Fallback: raw tab.url
  return tab.url || null;
}

/**
 * Legacy function for backward compatibility
 * @param {string} url
 * @returns {string|null}
 */
function resolveCanonicalUrl(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);

    if (urlObj.protocol === "chrome-extension:") {
      return extractUrlFromExtension(url);
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Normalize URL for deduplication: strip trailing slash and fragment
 * @param {string} url
 * @returns {string}
 */
function normalizeUrlForDedup(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    // Remove fragment
    urlObj.hash = "";
    let normalized = urlObj.href;
    // Remove trailing slash (except for root paths like "https://example.com/")
    if (normalized.endsWith("/") && urlObj.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Whether a tab can be saved: a real page, not a browser-internal or
 * extension page. Suspended tabs count, because getTabUrl resolves them.
 * @param {Object} tab - Chrome tab object
 * @param {string} ownExtensionId - chrome.runtime.id, passed in to keep this file pure
 * @returns {boolean}
 */
function isSaveableTab(tab, ownExtensionId) {
  const url = getTabUrl(tab);
  if (!url) return false;

  const internalSchemes = ["chrome://", "about://", "about:", "edge://", "brave://"];
  if (internalSchemes.some((scheme) => url.startsWith(scheme))) return false;

  // Tabby's own pages, and any other extension page that did not resolve
  // to a real URL.
  if (ownExtensionId && url.startsWith(`chrome-extension://${ownExtensionId}/`)) return false;
  if (url.startsWith("chrome-extension://")) return false;

  return true;
}
