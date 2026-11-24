// TEST HELPER — loads Tabby's plain-global scripts into one Node vm context
// with an in-memory chrome.storage.local, so pure and storage code can be
// tested without a browser.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

function loadScripts(...relativePaths) {
  const store = {};

  const pick = (keys) => {
    if (keys === undefined || keys === null) return { ...store };
    const list = Array.isArray(keys) ? keys : [keys];
    const out = {};
    for (const key of list) {
      if (key in store) out[key] = structuredClone(store[key]);
    }
    return out;
  };

  const chrome = {
    runtime: { id: "tabbyid" },
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (obj) => {
          for (const [key, value] of Object.entries(obj)) {
            store[key] = structuredClone(value);
          }
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete store[key];
        },
      },
    },
  };

  const context = vm.createContext({ chrome, URL, URLSearchParams, console, structuredClone, setTimeout, clearTimeout });

  // One combined script, so top-level const/function declarations share scope.
  const source = relativePaths
    .map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"))
    .join("\n;\n");
  vm.runInContext(source, context, { filename: relativePaths.join("+") });

  return {
    store,
    chrome, // tests may attach further fakes, e.g. chrome.tabs
    evaluate: (expr) => vm.runInContext(expr, context),
  };
}

module.exports = { loadScripts };
