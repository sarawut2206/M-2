// ทดสอบตรรกะของ Code.gs ด้วยตัวจำลอง (ไม่ใช่ Apps Script จริง)   รัน:  node apps-script/mock-test.js
const assert = require("node:assert/strict");
const { call, run, props, ss, fetchCalls, setFetchReply } = require("./mock-world");

(async () => {
  // setup + ก่อนตั้งรหัสครู
  run("setup");
  assert.ok(props.SESSION_SECRET && props.PHOTO_FOLDER_ID);
  assert.equal(call({ action: "login", role: "teacher", password: "x" }).code, "NOT_SETUP");
  props.TEACHER_PASSWORD = "teacher-pass-1";

  assert.equal(call({ action: "nope" }).code, "BAD_REQUEST");
  assert.equal(call({ action: "getProject" }).code, "UNAUTHORIZED");
  assert.equal(call({ action: "login", role: "teacher", password: "wrong" }).code, "BAD_CREDENTIALS");
  const t = call({ action: "login", role: "teacher", password: "teacher-pass-1" });
  assert.ok(t.ok && t.token);
  assert.equal(call({ action: "me", token: t.token }).role, "teacher");

  // PIN
  assert.equal(call({ action: "login", role: "group", group: 1, pin: "123456" }).code, "NO_PIN");
  assert.equal(call({ action: "teacherSetPin", all: true }).code, "UNAUTHORIZED");
  const pinsRes = call({ action: "teacherSetPin", token: t.token, all: true });
  assert.equal(Object.keys(pinsRes.pins).length, 15);
  assert.ok(Object.values(pinsRes.pins).every(p => /^\d{6}$/.test(p)));
  assert.equal(call({ action: "teacherSetPin", token: t.token, all: true }).pins[1], undefined); // ไม่ทับกลุ่มที่มี PIN แล้ว
  const sheetPin = ss.getSheetByName("Groups").getRange(2, 2).getValue();
  assert.ok(!sheetPin.includes(pinsRes.pins[1]), "ในชีตต้องเก็บแฮช ไม่ใช่ PIN");

  const g1 = call({ action: "login", role: "group", group: 1, pin: pinsRes.pins[1] });
  const g2 = call({ action: "login", role: "group", group: 2, pin: pinsRes.pins[2] });
  assert.ok(g1.ok && g2.ok);
  assert.equal(call({ action: "login", role: "group", group: 1, pin: pinsRes.pins[2] }).code, "BAD_CREDENTIALS");
  assert.equal(call({ action: "me", token: g1.token + "x" }).code, "UNAUTHORIZED");
  assert.equal(call({ action: "teacherOverview", token: g1.token }).code, "FORBIDDEN");

  // บันทึก + เวอร์ชัน
  const proj = { classroom: "ม.2/3", groupNo: "9", projectTitle: "เครื่องใส่ถุงเท้า", problem: "p", objectives: "o",
    materials: [{ id: "m1", name: "ท่อ PVC", qty: "2", unit: "ท่อน", role: "โครง" }],
    steps: [{ id: "s1", title: "ตัดท่อ", action: "ตัดท่อ", materials: "เลื่อย", detail: "" }], testMethod: "ทดลอง" };
  assert.equal(call({ action: "getProject", token: g1.token }).row, null);
  const s1 = call({ action: "saveProject", token: g1.token, data: proj, baseVersion: 0 });
  assert.equal(s1.row.version, 1);
  assert.equal(s1.row.data.groupNo, "1", "ต้องบังคับ groupNo ตามเซสชัน");
  assert.equal(call({ action: "saveProject", token: g1.token, data: proj, baseVersion: 0 }).code, "CONFLICT");
  const s2 = call({ action: "saveProject", token: g1.token, data: { ...proj, projectTitle: "ใหม่" }, baseVersion: 1, submit: true });
  assert.equal(s2.row.version, 2); assert.equal(s2.row.status, "submitted"); assert.ok(s2.row.submittedAt);
  const s3 = call({ action: "saveProject", token: g1.token, data: proj, baseVersion: 2 });
  assert.equal(s3.row.status, "draft");
  assert.equal(call({ action: "saveProject", token: g1.token, data: proj, baseVersion: 1, force: true }).row.version, 4);
  assert.equal(call({ action: "saveProject", token: g1.token, data: { materials: "x", steps: [] } }).code, "BAD_REQUEST");
  assert.equal(call({ action: "saveProject", token: g1.token, baseVersion: 4, data: { ...proj, problem: "ก".repeat(46000) } }).code, "TOO_LARGE");
  assert.equal(call({ action: "getProject", token: g2.token }).row, null, "กลุ่ม 2 ต้องไม่เห็นงานกลุ่ม 1");

  // รูปภาพ
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fakejpegdata")]).toString("base64");
  const up = call({ action: "uploadPhoto", token: g1.token, dataUrl: "data:image/jpeg;base64," + jpeg });
  assert.ok(up.ok && up.id);
  assert.equal(call({ action: "uploadPhoto", token: g1.token, dataUrl: "data:text/html;base64,PGI+" }).code, "BAD_REQUEST");
  assert.equal(call({ action: "uploadPhoto", token: g1.token, dataUrl: "data:image/jpeg;base64," + Buffer.from("not a jpeg at all").toString("base64") }).code, "BAD_REQUEST");
  const ph = call({ action: "getPhoto", token: g1.token, id: up.id });
  assert.equal(ph.dataUrl, "data:image/jpeg;base64," + jpeg);
  assert.equal(call({ action: "getPhoto", token: g2.token, id: up.id }).code, "NOT_FOUND", "กลุ่ม 2 ต้องดูรูปกลุ่ม 1 ไม่ได้");
  assert.ok(call({ action: "getPhoto", token: t.token, id: up.id }).ok);

  // ร่าง (ไม่มีคีย์ → fallback; มีคีย์ → เรียก OpenAI)
  const d1 = call({ action: "draft", token: g1.token, project: proj });
  assert.equal(d1.mode, "fallback"); assert.match(d1.draft.materialsIntro, /ท่อ PVC/); assert.ok(!d1.draft.materialsIntro.includes("、"));
  assert.equal(call({ action: "draft", project: proj }).code, "UNAUTHORIZED");
  props.OPENAI_API_KEY = "sk-test";
  const aiDraft = { materialsIntro: "a", design: "b", steps: [], testing: "c", improvement: "d", missingInfo: [] };
  setFetchReply({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(aiDraft) }] }] }) });
  const withPhoto = { ...proj, draft: { x: 1 }, materials: [{ ...proj.materials[0], photo: { id: "PHOTO-SECRET" } }] };
  const d2 = call({ action: "draft", token: g1.token, project: withPhoto });
  assert.equal(d2.mode, "ai"); assert.deepEqual(d2.draft, aiDraft);
  assert.ok(!fetchCalls[0].opt.payload.includes("PHOTO-SECRET"), "ต้องไม่ส่งข้อมูลรูปให้ AI");
  assert.equal(fetchCalls[0].opt.headers.Authorization, "Bearer sk-test");
  setFetchReply({ getResponseCode: () => 401, getContentText: () => JSON.stringify({ error: { message: "bad key" } }) });
  assert.equal(call({ action: "draft", token: g1.token, project: proj }).code, "AI_ERROR");

  // ครู
  const ov = call({ action: "teacherOverview", token: t.token });
  assert.equal(ov.groups.length, 15); assert.equal(ov.groups[0].row.version, 4); assert.equal(ov.groups[1].row, null); assert.ok(ov.groups.every(g => g.hasPin));
  assert.ok(call({ action: "teacherSetComment", token: t.token, group: 1, comment: "=HYPERLINK(1)" }).ok);
  assert.equal(ss.getSheetByName("Projects").getRange(2, 5).getValue()[0], " ", "ต้องกันสูตรในเซลล์");
  assert.equal(call({ action: "teacherSetComment", token: t.token, group: 2, comment: "x" }).code, "NOT_FOUND");
  assert.equal(call({ action: "getProject", token: g1.token }).row.teacherComment, " =HYPERLINK(1)");
  assert.equal(call({ action: "teacherGetProject", token: t.token, group: 99 }).code, "BAD_REQUEST");

  // รีเซ็ต PIN → token เก่าใช้ไม่ได้ และบันทึกยังเหลืออยู่
  const reset = call({ action: "teacherSetPin", token: t.token, group: 1 });
  assert.equal(call({ action: "getProject", token: g1.token }).code, "UNAUTHORIZED");
  const g1b = call({ action: "login", role: "group", group: 1, pin: reset.pins[1] });
  assert.equal(call({ action: "getProject", token: g1b.token }).row.version, 4);

  // ล็อกเมื่อผิดหลายครั้ง
  for (let i = 0; i < 6; i++) call({ action: "login", role: "group", group: 3, pin: "000000" });
  assert.equal(call({ action: "login", role: "group", group: 3, pin: pinsRes.pins[3] }).code, "LOCKED");
  assert.ok(call({ action: "teacherSetPin", token: t.token, group: 3 }).ok); // ครูรีเซ็ตแล้วปลดล็อก
  // เปลี่ยนรหัสครู → token ครูเก่าใช้ไม่ได้
  props.TEACHER_PASSWORD = "another-pass-22";
  assert.equal(call({ action: "teacherOverview", token: t.token }).code, "UNAUTHORIZED");

  console.log("ผ่านทุกการทดสอบ");
})().catch(e => { console.error("ล้มเหลว:", e); process.exit(1); });
