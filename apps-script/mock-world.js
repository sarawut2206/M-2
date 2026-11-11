// ตัวจำลอง Apps Script/Sheets/Drive ในหน่วยความจำ ใช้รัน Code.gs ในเครื่องเพื่อทดสอบ (ไม่ใช่ Apps Script จริง)
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");

const signed = buf => Array.from(new Int8Array(Buffer.from(buf)));
const unsigned = bytes => Buffer.from(Uint8Array.from(bytes.map(b => (b + 256) % 256)));
const toBuf = v => (typeof v === "string" ? Buffer.from(v, "utf8") : unsigned(v));

// ---- Sheets ----
function makeSheet() {
  const cells = new Map();
  const key = (r, c) => `${r},${c}`;
  const sh = {
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValue: () => cells.get(key(r, c)) ?? "",
        setValue: v => { cells.set(key(r, c), v); },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cells.get(key(r + i, c + j)) ?? "")),
        setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => cells.set(key(r + i, c + j), v)))
      };
    },
    getLastRow: () => Math.max(0, ...[...cells.keys()].map(k => Number(k.split(",")[0]))),
    appendRow(row) { const r = sh.getLastRow() + 1; row.forEach((v, j) => cells.set(key(r, j + 1), v)); },
    setFrozenRows() {}
  };
  return sh;
}
function makeSS() {
  const sheets = {};
  const ss = {
    getSheetByName: n => sheets[n] ?? null,
    insertSheet: n => (sheets[n] = makeSheet()),
    getId: () => "mock-sheet-id", getUrl: () => "https://docs.google.com/mock"
  };
  return ss;
}

// ---- โลกจำลอง ----
const props = {}, cache = new Map(), files = {};
const ss = makeSS();
const fetchCalls = [];
let fetchReply = null;
const setFetchReply = r => { fetchReply = r; };
const ctx = {
  console, Date, JSON, Math, Object, Array, String, Number, Error, parseInt, Logger: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({
    get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, create: () => ss },
  DriveApp: {
    createFolder: () => ({ getId: () => "folder1" }),
    getFolderById: () => ({ createFile: blob => { const id = "file" + Object.keys(files).length; files[id] = blob; return { getId: () => id }; } }),
    getFileById: id => ({ getBlob: () => files[id] })
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac("sha256", toBuf(k)).update(toBuf(v)).digest()),
    base64EncodeWebSafe: v => toBuf(v).toString("base64url") + ((4 - (toBuf(v).toString("base64url").length % 4)) % 4 ? "" : ""),
    base64DecodeWebSafe: s => signed(Buffer.from(s, "base64url")),
    base64Encode: v => toBuf(v).toString("base64"),
    base64Decode: s => signed(Buffer.from(s, "base64")),
    newBlob: (data, type, name) => { const b = toBuf(data); return { getBytes: () => signed(b), getDataAsString: () => b.toString("utf8"), getContentType: () => type, name }; }
  },
  UrlFetchApp: { fetch: (url, opt) => { fetchCalls.push({ url, opt }); return fetchReply; } },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8"), ctx);

const call = body => JSON.parse(vm.runInContext("doPost", ctx)({ postData: { contents: JSON.stringify(body) } }).getContent());
const run = fn => vm.runInContext(fn, ctx)();


module.exports = { call, run, props, ss, files, fetchCalls, setFetchReply, ctx };
