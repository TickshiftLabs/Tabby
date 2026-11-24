const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const ctx = loadScripts("lib/urls.js", "lib/domains.js");
const sites = (tabs) => JSON.parse(ctx.evaluate(`JSON.stringify(openTabsBySite(${JSON.stringify(tabs)}))`));

test("open tabs are counted per site, busiest first", () => {
  const result = sites([
    { url: "https://github.com/a" },
    { url: "https://www.reddit.com/r/x", favIconUrl: "https://reddit.com/icon.png" },
    { url: "https://github.com/b", favIconUrl: "https://github.com/fav.ico" },
    { url: "https://reddit.com/r/y" },
    { url: "https://github.com/c" },
    { url: "https://apple.test/" },
  ]);
  assert.deepEqual(
    result.map((s) => [s.domain, s.count]),
    [["github.com", 3], ["reddit.com", 2], ["apple.test", 1]]
  );
  assert.equal(result[0].favicon, "https://github.com/fav.ico");
  assert.equal(result[2].favicon, "");
});

test("sites with the same count are listed alphabetically", () => {
  const result = sites([{ url: "https://b.test/" }, { url: "https://a.test/" }]);
  assert.deepEqual(result.map((s) => s.domain), ["a.test", "b.test"]);
});

test("suspended tabs count under their real site, internal pages are left out", () => {
  const result = sites([
    { url: "chrome-extension://x/suspended.html?url=https%3A%2F%2Fgithub.com%2Fz" },
    { url: "", pendingUrl: "https://github.com/y" },
    { url: "chrome://extensions" },
    { url: "about:blank" },
    {},
  ]);
  assert.deepEqual(result.map((s) => [s.domain, s.count]), [["github.com", 2]]);
});

test("no tabs gives an empty list", () => assert.deepEqual(sites([]), []));
