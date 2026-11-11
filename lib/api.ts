import { API_URL } from "./config";
import type { Draft, Project, ProjectRow } from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public row: ProjectRow | null = null) { super(message); }
}

const TOKEN_KEY = "isw-token";
export const tokenStore = {
  get(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
};

async function call<T>(action: string, body: Record<string, unknown> = {}, auth = true): Promise<T> {
  if (!API_URL) throw new ApiError("NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า URL ของ Apps Script (NEXT_PUBLIC_API_URL)");
  let res: Response;
  try {
    // ส่งเป็นข้อความธรรมดา (ไม่ใส่ Content-Type) เพื่อเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ
    res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action, token: auth ? tokenStore.get() : undefined, ...body }) });
  } catch {
    throw new ApiError("NETWORK", "เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต");
  }
  let data: { ok: boolean; code?: string; error?: string; row?: ProjectRow | null } & Record<string, unknown>;
  try { data = await res.json(); } catch { throw new ApiError("BAD_RESPONSE", "ระบบตอบกลับผิดรูปแบบ (ตรวจสอบว่าตั้งค่า Web App เป็น “ทุกคน” แล้ว)"); }
  if (!data.ok) {
    if (data.code === "UNAUTHORIZED") tokenStore.clear();
    throw new ApiError(data.code || "ERROR", data.error || "เกิดข้อผิดพลาด", data.row ?? null);
  }
  return data as unknown as T;
}

export type Me = { role: "group"; group: number } | { role: "teacher" } | { role: null };
export type TeacherGroup = { no: number; hasPin: boolean; row: ProjectRow | null };

export const api = {
  async loginGroup(group: number, pin: string) {
    const r = await call<{ token: string }>("login", { role: "group", group, pin }, false);
    tokenStore.set(r.token);
  },
  async loginTeacher(password: string) {
    const r = await call<{ token: string }>("login", { role: "teacher", password }, false);
    tokenStore.set(r.token);
  },
  logout() { tokenStore.clear(); },
  async me(): Promise<Me> {
    if (!tokenStore.get()) return { role: null };
    try { const r = await call<{ role: "group" | "teacher"; group?: number }>("me"); return r.role === "group" ? { role: "group", group: r.group! } : { role: "teacher" }; }
    catch (e) { if (e instanceof ApiError && e.code === "UNAUTHORIZED") return { role: null }; throw e; }
  },
  getProject: async () => (await call<{ row: ProjectRow | null }>("getProject")).row,
  saveProject: async (data: Project, baseVersion: number, o: { submit?: boolean; force?: boolean } = {}) =>
    (await call<{ row: ProjectRow }>("saveProject", { data, baseVersion, submit: !!o.submit, force: !!o.force })).row,
  uploadPhoto: async (dataUrl: string) => (await call<{ id: string }>("uploadPhoto", { dataUrl })).id,
  getPhoto: async (id: string) => (await call<{ dataUrl: string }>("getPhoto", { id })).dataUrl,
  draft: (project: Project) => call<{ draft: Draft; mode: "ai" | "fallback" }>("draft", { project }),
  teacher: {
    overview: async () => (await call<{ groups: TeacherGroup[] }>("teacherOverview")).groups,
    getProject: async (group: number) => (await call<{ row: ProjectRow | null }>("teacherGetProject", { group })).row,
    setPin: async (o: { group?: number; all?: boolean }) => (await call<{ pins: Record<number, string> }>("teacherSetPin", o)).pins,
    setComment: async (group: number, comment: string) => { await call("teacherSetComment", { group, comment }); }
  }
};

// ---- แคชรูป (ในหน่วยความจำ) ----
const photoCache = new Map<string, Promise<string>>();
export function fetchPhoto(id: string): Promise<string> {
  let p = photoCache.get(id);
  if (!p) {
    p = api.getPhoto(id);
    photoCache.set(id, p);
    p.catch(() => photoCache.delete(id));
  }
  return p;
}
export function primePhoto(id: string, dataUrl: string) { photoCache.set(id, Promise.resolve(dataUrl)); }
export function clearPhotoCache() { photoCache.clear(); }
