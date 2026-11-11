// เซิร์ฟเวอร์จำลอง Apps Script สำหรับลองหน้าเว็บในเครื่องโดยยังไม่ต้องติดตั้งของจริง
// รัน:  node apps-script/mock-server.js   แล้วตั้ง NEXT_PUBLIC_API_URL=http://localhost:8787 ตอน npm run dev
const http = require("node:http");
const { call, run, props } = require("./mock-world");

run("setup");
props.TEACHER_PASSWORD = "demo-teacher-pw";
const t = call({ action: "login", role: "teacher", password: "demo-teacher-pw" });
const pins = call({ action: "teacherSetPin", token: t.token, all: true }).pins;
console.log("รหัสผ่านครู: demo-teacher-pw");
console.log("PIN กลุ่ม 1-3:", pins[1], pins[2], pins[3], "(ข้อมูลอยู่ในหน่วยความจำ หายเมื่อปิดโปรแกรม)");

http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    const out = req.method === "POST"
      ? vmPost(body)
      : JSON.stringify({ ok: true, service: "mock" });
    res.writeHead(200, { ...cors, "Content-Type": "application/json; charset=utf-8" });
    res.end(out);
  });
}).listen(8787, () => console.log("mock Apps Script ที่ http://localhost:8787"));

function vmPost(body) {
  return require("node:vm").runInContext("doPost", require("./mock-world").ctx)({ postData: { contents: body } }).getContent();
}
