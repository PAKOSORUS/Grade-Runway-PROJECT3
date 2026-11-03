const { test, expect } = require("@playwright/test");
const { EMU, emulatorIdToken } = require("./helpers");

// Emulator only. Firestore Rules (firebase/firestore.rules, spec 4): only active lecturer/admin
// may read chatMessages directly; students and every other collection are denied.
const base = `${EMU.firestore}/v1/projects/${EMU.project}/databases/(default)/documents`;
const get = (path, token) => fetch(`${base}/${path}`, { headers: { authorization: `Bearer ${token}` } });

test.describe("5. direct Firestore REST access (emulator)", () => {
  test("student2 cannot list chatMessages (403)", async () => {
    const res = await get("chatMessages", await emulatorIdToken("student2"));
    expect(res.status).toBe(403);
  });

  test("student2 cannot read another student's message (403)", async () => {
    const res = await get("chatMessages/msg-a", await emulatorIdToken("student2"));
    expect(res.status).toBe(403);
  });

  test("student2 cannot read users (403)", async () => {
    const res = await get("users", await emulatorIdToken("student2"));
    expect(res.status).toBe(403);
  });

  test("student2 cannot write chatMessages (403)", async () => {
    const token = await emulatorIdToken("student2");
    const res = await fetch(`${base}/chatMessages/e2e-forged`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ fields: { content: { stringValue: "forged" }, status: { stringValue: "approved" } } }),
    });
    expect(res.status).toBe(403);
  });

  test("control: reviewer1 (lecturer) can list chatMessages (200)", async () => {
    const res = await get("chatMessages", await emulatorIdToken("reviewer1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.documents)).toBe(true);
  });

  test("control: reviewer1 still cannot read users (403)", async () => {
    const res = await get("users", await emulatorIdToken("reviewer1"));
    expect(res.status).toBe(403);
  });
});
