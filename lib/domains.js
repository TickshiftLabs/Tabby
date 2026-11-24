// PURE FUNCTIONS ONLY — no side effects, no DOM, no chrome APIs
// Depends on: lib/urls.js (extractUrlFromExtension)

/**
 * Extract domain from a URL, normalizing www. prefix
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  if (!url) return null;

  // If it's still an extension URL, try to extract the real URL first
  let targetUrl = url;
  if (url.startsWith("chrome-extension://")) {
    const extracted = extractUrlFromExtension(url);
    if (extracted) {
      targetUrl = extracted;
    } else {
      return null;
    }
  }

  try {
    const urlObj = new URL(targetUrl);
    if (urlObj.protocol === "chrome:" || urlObj.protocol === "about:") {
      return null;
    }
    // Normalize domain by stripping www. prefix for consistent display
    let hostname = urlObj.hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Count open tabs per site, busiest first (ties alphabetical).
 * Suspended and discarded tabs count under their real site; tabs without
 * a site (browser-internal pages) are left out.
 * @param {Array} tabs - Chrome tab objects
 * @returns {Array<{domain: string, count: number, favicon: string}>}
 */
function openTabsBySite(tabs) {
  const sites = new Map();

  for (const tab of tabs) {
    const domain = extractDomain(getTabUrl(tab));
    if (!domain) continue;
    if (!sites.has(domain)) sites.set(domain, { domain, count: 0, favicon: "" });
    const site = sites.get(domain);
    site.count += 1;
    if (!site.favicon && tab.favIconUrl) site.favicon = tab.favIconUrl;
  }

  return [...sites.values()].sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}
