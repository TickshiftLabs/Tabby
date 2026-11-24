const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const ctx = loadScripts("lib/dates.js", "lib/urls.js", "library/model.js");

const snaps = [
  {
    id: "a", customName: "Rust", createdAt: 3000, starred: true, folderId: "f1",
    tabs: [
      { url: "https://docs.rs/tokio", title: "tokio::select", domain: "docs.rs" },
      { url: "https://github.com/x", title: "Issue", domain: "github.com" },
      { url: "https://docs.rs/pin", title: "std::pin", domain: "docs.rs" },
    ],
  },
  { id: "b", createdAt: 1000, folderId: "gone", tabs: [{ url: "https://x.test/", title: "<img src=x onerror=1>" }] },
  { id: "c", customName: "apples", createdAt: 2000, tabs: [] },
];
const folders = [{ id: "f1", name: "Work" }, { id: "f2", name: "Home" }];

// Values cross the vm boundary as JSON so assertions compare plain data.
const call = (fn, ...args) =>
  JSON.parse(ctx.evaluate(`JSON.stringify(${fn}(${args.map((a) => JSON.stringify(a)).join(",")}) ?? null)`));
const ids = (list) => list.map((s) => s.id);

test("display name falls back to a dated label", () => {
  assert.equal(call("snapshotDisplayName", snaps[0]), "Rust");
  assert.ok(call("snapshotDisplayName", snaps[1]).startsWith("Snapshot · "));
});

test("display name of a trashed single tab is its stored name", () => {
  assert.equal(call("snapshotDisplayName", { trashType: "tab", name: "T" }), "T");
});

test("place counts ignore folder ids that no longer exist", () => {
  assert.deepEqual(call("placeCounts", snaps, folders), { all: 3, starred: 1, folders: { f1: 1, f2: 0 } });
});

test("places filter snapshots", () => {
  assert.deepEqual(ids(call("snapshotsForPlace", snaps, folders, { type: "all" })), ["a", "b", "c"]);
  assert.deepEqual(ids(call("snapshotsForPlace", snaps, folders, { type: "starred" })), ["a"]);
  assert.deepEqual(ids(call("snapshotsForPlace", snaps, folders, { type: "folder", folderId: "f1" })), ["a"]);
});

test("sort by recent and by name", () => {
  assert.deepEqual(ids(call("sortSnapshots", snaps, "recent")), ["a", "c", "b"]);
  assert.deepEqual(ids(call("sortSnapshots", snaps, "alpha")), ["c", "a", "b"]);
});

test("search matches tab title, domain and url, case-insensitively", () => {
  const results = call("searchSnapshots", snaps, "DOCS");
  assert.equal(results.length, 1);
  assert.equal(results[0].snapshot.id, "a");
  assert.deepEqual(results[0].matchIndices, [0, 2]);
});

test("a snapshot name match returns all of its tabs", () => {
  const results = call("searchSnapshots", snaps, "rust");
  assert.deepEqual(ids(results.map((r) => r.snapshot)), ["a"]);
  assert.deepEqual(results[0].matchIndices, [0, 1, 2]);
});

test("a blank query returns every snapshot", () => {
  assert.equal(call("searchSnapshots", snaps, "  ").length, 3);
});

test("search tolerates snapshots without a tabs array", () => {
  assert.deepEqual(call("searchSnapshots", [{ id: "x", createdAt: 1 }], "q"), []);
});

test("tabs group by domain, largest group first, keeping original indices", () => {
  const groups = call("groupTabsByDomain", snaps[0].tabs);
  assert.deepEqual(groups.map((g) => g.domain), ["docs.rs", "github.com"]);
  assert.deepEqual(groups[0].items.map((i) => i.index), [0, 2]);
});

test("tabs without a domain group under Other", () => {
  assert.equal(call("groupTabsByDomain", snaps[1].tabs)[0].domain, "Other");
});

test("grouping can be restricted to given indices", () => {
  const groups = call("groupTabsByDomain", snaps[0].tabs, [1]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((i) => i.index), [1]);
});

test("site icons list the most frequent domains", () => {
  assert.equal(call("siteIcons", snaps[0])[0].domain, "docs.rs");
  assert.deepEqual(call("siteIcons", snaps[2]), []);
  assert.deepEqual(call("siteIcons", {}), []);
});

test("selection survives when still visible, else falls back", () => {
  assert.equal(call("resolveSelection", "b", snaps), "b");
  assert.equal(call("resolveSelection", "zzz", snaps), "a");
  assert.equal(call("resolveSelection", "zzz", []), null);
});

test("highlight escapes HTML before marking matches", () => {
  assert.equal(call("highlight", "<img src=x onerror=1>", "img"), "&lt;<mark>img</mark> src=x onerror=1&gt;");
  assert.equal(call("highlight", "a.b", "."), "a<mark>.</mark>b");
  assert.equal(call("highlight", "x", ""), "x");
});

test("highlight never matches inside an HTML entity", () => {
  assert.equal(call("highlight", "Tom & Jerry", "a"), "Tom &amp; Jerry");
  assert.equal(call("highlight", "It's here", "3"), "It&#39;s here");
  assert.equal(call("highlight", "R&D lab", "&"), "R<mark>&amp;</mark>D lab");
  assert.equal(call("highlight", "a<b", "<B"), "a<mark>&lt;b</mark>");
});

test("null entries in a tabs array do not break search or grouping", () => {
  const snap = { id: "n", createdAt: 1, tabs: [null, { url: "https://a.test/", title: "A", domain: "a.test" }] };
  assert.deepEqual(call("searchSnapshots", [snap], "a.test")[0].matchIndices, [1]);
  assert.deepEqual(call("groupTabsByDomain", snap.tabs).map((g) => g.domain), ["a.test"]);
});

test("newItemsById keeps only unseen, well-formed items", () => {
  const existing = [{ id: "a", tabs: [] }];
  const incoming = [{ id: "a", tabs: [] }, { id: "b", tabs: [] }, { id: "b", tabs: [] }, { tabs: [] }, null, { id: "c" }];
  assert.deepEqual(call("newItemsById", existing, incoming, true).map((i) => i.id), ["b"]);
  assert.deepEqual(call("newItemsById", existing, incoming, false).map((i) => i.id), ["b", "c"]);
});
