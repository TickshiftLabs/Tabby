const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const ctx = loadScripts("lib/dates.js");
const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const rel = (msAgo) => ctx.evaluate(`formatRelativeDate(${NOW - msAgo}, ${NOW})`);
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("under a minute is 'just now'", () => assert.equal(rel(30 * 1000), "just now"));
test("minutes", () => assert.equal(rel(5 * MIN), "5m ago"));
test("hours", () => assert.equal(rel(2 * HOUR), "2h ago"));
test("days", () => assert.equal(rel(3 * DAY), "3d ago"));
test("a week or more shows the short date", () =>
  assert.equal(rel(10 * DAY), ctx.evaluate(`formatShortDate(${NOW - 10 * DAY})`)));
test("a missing timestamp gives an empty string", () =>
  assert.equal(ctx.evaluate(`formatRelativeDate(undefined, ${NOW})`), ""));
