// parseNegative (web/shared/ai.js) turns the model's reply into true/false/null.
// ai.js has no static imports, so load it through a data: URL like roles.test.js does.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "web", "shared", "ai.js"), "utf8");
const load = () => import("data:text/javascript;charset=utf-8," + encodeURIComponent(src));

test("parseNegative accepts plain and fenced JSON", async () => {
  const { parseNegative } = await load();
  assert.equal(parseNegative('{"negative": true}'), true);
  assert.equal(parseNegative('{"negative": false}'), false);
  assert.equal(parseNegative("```json\n{\"negative\": true}\n```"), true);
  assert.equal(parseNegative("```\n{\"negative\":false}\n```"), false);
  assert.equal(parseNegative("true"), true);
});

test("parseNegative returns null for anything else", async () => {
  const { parseNegative } = await load();
  for (const bad of ['{"negative": "true"}', '{"negative": null}', "เชิงลบ", "", "{}", "[true]", undefined, 5]) {
    assert.equal(parseNegative(bad), null, String(bad));
  }
});

test("buildSummaryInput sends only content and previous content/reason", async () => {
  const { buildSummaryInput } = await load();
  assert.deepEqual(buildSummaryInput("ใหม่", null), { content: "ใหม่" });
  const leaky = { content: "เดิม", reason: "สุภาพขึ้น", senderName: "สมชาย", senderId: "stu-1" };
  const input = buildSummaryInput("ใหม่", leaky);
  assert.deepEqual(input, { content: "ใหม่", previous: { content: "เดิม", reason: "สุภาพขึ้น" } });
  assert.equal(JSON.stringify(input).includes("สมชาย"), false);
  assert.equal(JSON.stringify(input).includes("stu-1"), false);
});

test("parseSummary accepts the expected shape, fenced or not, and clips long fields", async () => {
  const { parseSummary } = await load();
  const ok = '{"topic":"เรื่องการทบทวน","cautions":["ภาษาแรง"],"addressedPreviousReason":true}';
  assert.deepEqual(parseSummary(ok, true), { topic: "เรื่องการทบทวน", cautions: ["ภาษาแรง"], addressedPreviousReason: true });
  assert.equal(parseSummary("```json\n" + ok + "\n```", true).topic, "เรื่องการทบทวน");
  // without a previous message the "addressed" answer is meaningless and forced to null
  assert.equal(parseSummary(ok, false).addressedPreviousReason, null);
  const long = JSON.stringify({ topic: "ก".repeat(900), cautions: Array(9).fill("ข"), addressedPreviousReason: null });
  const s = parseSummary(long, false);
  assert.equal(s.topic.length, 300);
  assert.equal(s.cautions.length, 5);
});

test("parseSummary returns null for any other shape", async () => {
  const { parseSummary } = await load();
  for (const bad of [
    "", "สรุปว่า...", "[]", '{"topic":""}', '{"topic":"a"}', '{"topic":"a","cautions":"x","addressedPreviousReason":null}',
    '{"topic":"a","cautions":[1],"addressedPreviousReason":null}', '{"topic":"a","cautions":[],"addressedPreviousReason":"yes"}',
    '{"topic":"a","cautions":[]}', undefined,
  ]) {
    assert.equal(parseSummary(bad, true), null, String(bad));
  }
});
