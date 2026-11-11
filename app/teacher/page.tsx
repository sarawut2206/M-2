"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api, clearPhotoCache, tokenStore, type TeacherGroup } from "@/lib/api";
import { downloadChapter3 } from "@/lib/exportWord";
import { calcProgress, type ProjectRow } from "@/lib/types";
import { ReportPreview } from "../components/ReportPreview";

const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";
const errText = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

export default function TeacherPage() {
  const [authed, setAuthed] = useState<boolean | undefined>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [pins, setPins] = useState<Record<number, string> | null>(null);
  const [view, setView] = useState<{ no: number; row: ProjectRow | null } | null>(null);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setNotice("");
    try { setGroups(await api.teacher.overview()); setAuthed(true); }
    catch (e) {
      if (e instanceof ApiError && (e.code === "UNAUTHORIZED" || e.code === "FORBIDDEN")) setAuthed(false);
      else { setAuthed(tokenStore.get() ? true : false); setNotice(errText(e)); }
    }
  }, []);
  useEffect(() => { if (tokenStore.get()) load(); else setAuthed(false); }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try { await api.loginTeacher(password); setPassword(""); await load(); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  }
  function logout() { api.logout(); clearPhotoCache(); setAuthed(false); setGroups([]); setView(null); setPins(null); }

  async function makePins(o: { group?: number; all?: boolean }) {
    if (o.group && groups.find(g => g.no === o.group)?.hasPin && !confirm(`กลุ่ม ${o.group} มี PIN อยู่แล้ว ต้องการรีเซ็ตใช่หรือไม่? PIN เดิมจะใช้ไม่ได้ และนักเรียนที่กำลังใช้งานอยู่จะถูกให้เข้าสู่ระบบใหม่`)) return;
    setBusy(true);
    try {
      const result = await api.teacher.setPin(o);
      if (!Object.keys(result).length) setNotice("ทุกกลุ่มมี PIN อยู่แล้ว"); else setPins(result);
      await load();
    } catch (e) { setNotice(errText(e)); } finally { setBusy(false); }
  }

  async function open(no: number) {
    setBusy(true);
    try {
      const row = await api.teacher.getProject(no);
      setView({ no, row }); setComment(row?.teacherComment ?? ""); setNotice("");
    } catch (e) { setNotice(errText(e)); } finally { setBusy(false); }
  }
  async function saveComment() {
    if (!view) return;
    try { await api.teacher.setComment(view.no, comment); setNotice("บันทึกข้อความถึงกลุ่มแล้ว"); await load(); }
    catch (e) { setNotice(errText(e)); }
  }
  async function downloadWord(g: TeacherGroup) {
    if (!g.row?.data.draft) return;
    setNotice(`กำลังสร้างไฟล์ Word ของกลุ่ม ${g.no}...`);
    try { await downloadChapter3(g.row.data, g.no); setNotice(`ดาวน์โหลด Word กลุ่ม ${g.no} แล้ว`); }
    catch (e) { setNotice(errText(e)); }
  }

  if (authed === undefined) return <main className="login-wrap"><p className="muted">กำลังโหลด...</p></main>;
  if (!authed) return (
    <main className="login-wrap"><form className="login-card" onSubmit={login}>
      <div className="brand-icon">ครู</div><h1>แดชบอร์ดครู</h1>
      <label className="field"><span className="field-label">รหัสผ่านครู</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus /></label>
      {error && <div className="warning">{error}</div>}
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={!password || busy}>{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
      <Link className="login-link" href="/">สำหรับนักเรียน</Link>
    </form></main>
  );

  const submitted = groups.filter(g => g.row?.status === "submitted").length;
  const noPin = groups.filter(g => !g.hasPin).length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon">ครู</div><div><strong>IS Smart Writer · แดชบอร์ดครู</strong><small>ส่งงานแล้ว {submitted}/{groups.length} กลุ่ม</small></div></div>
        <div className="top-actions"><span className="saved">{notice}</span>
          <button className="btn btn-light" onClick={load}>รีเฟรช</button><button className="btn btn-light" onClick={logout}>ออกจากระบบ</button></div>
      </header>

      {pins && <section className="panel pin-sheet" style={{ marginTop: 20 }}>
        <div className="section-head"><h2>รหัส PIN ที่สร้างใหม่</h2><div className="row"><button className="btn btn-outline" onClick={() => window.print()}>พิมพ์</button><button className="btn btn-light" onClick={() => setPins(null)}>ปิด</button></div></div>
        <p className="muted"><b>บันทึกหรือพิมพ์เก็บไว้ตอนนี้</b> ในชีตเก็บเฉพาะค่าเข้ารหัส จะไม่แสดง PIN นี้อีก (ลืมให้กดรีเซ็ตกลุ่มนั้น)</p>
        <table className="tbl"><thead><tr><th>กลุ่ม</th><th>PIN</th></tr></thead>
          <tbody>{Object.entries(pins).map(([g, p]) => <tr key={g}><td>กลุ่ม {g}</td><td className="mono">{p}</td></tr>)}</tbody></table>
      </section>}

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="section-head"><h2>ภาพรวม {groups.length} กลุ่ม</h2>
          {noPin > 0 && <button className="btn btn-primary" disabled={busy} onClick={() => makePins({ all: true })}>สร้าง PIN ให้กลุ่มที่ยังไม่มี ({noPin} กลุ่ม)</button>}</div>
        <div className="table-scroll"><table className="tbl">
          <thead><tr><th>กลุ่ม</th><th>ชื่อโครงงาน</th><th>ความคืบหน้า</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>จัดการ</th></tr></thead>
          <tbody>{groups.map(g => {
            const r = g.row, progress = r ? calcProgress(r.data) : 0;
            return <tr key={g.no}>
              <td><b>{g.no}</b></td>
              <td>{r?.data.projectTitle || <span className="muted">{r ? "(ยังไม่ตั้งชื่อ)" : "ยังไม่เริ่ม"}</span>}{r?.data.classroom ? <small className="sub"> {r.data.classroom}</small> : null}</td>
              <td><div className="mini-track"><div style={{ width: `${progress}%` }} /></div><small>{progress}%</small></td>
              <td>{r?.status === "submitted" ? <span className="badge ok">ส่งแล้ว {fmt(r.submittedAt)}</span> : r ? <span className="badge">กำลังทำ</span> : <span className="badge dim">-</span>}</td>
              <td><small>{fmt(r?.updatedAt)}</small></td>
              <td><div className="row">
                <button className="btn btn-outline" disabled={!r || busy} onClick={() => open(g.no)}>ดู</button>
                <button className="btn btn-outline" disabled={!r?.data.draft} onClick={() => downloadWord(g)}>Word</button>
                <button className="btn btn-light" disabled={busy} onClick={() => makePins({ group: g.no })}>{g.hasPin ? "รีเซ็ต PIN" : "สร้าง PIN"}</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>

      {view && <section className="panel" style={{ marginTop: 20 }}>
        <div className="section-head"><h2>กลุ่ม {view.no}{view.row?.data.projectTitle ? ` · ${view.row.data.projectTitle}` : ""}</h2><button className="btn btn-light" onClick={() => setView(null)}>ปิด</button></div>
        {view.row && <>
          <div className="info-grid">
            <div><b>ปัญหา</b><p>{view.row.data.problem || "-"}</p></div>
            <div><b>วัตถุประสงค์</b><p>{view.row.data.objectives || "-"}</p></div>
          </div>
          <label className="field"><span className="field-label">ข้อความถึงกลุ่ม (นักเรียนจะเห็นบนหน้าจอของกลุ่ม)</span>
            <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="เช่น เพิ่มภาพตอนทดลองใช้งานอีก 1 ภาพ" /></label>
          <button className="btn btn-primary" onClick={saveComment}>บันทึกข้อความ</button>
          {view.row.data.draft ? <div style={{ marginTop: 20 }}><ReportPreview project={view.row.data} /></div> : <p className="muted" style={{ marginTop: 16 }}>กลุ่มนี้ยังไม่ได้สร้างร่างบทที่ 3</p>}
        </>}
      </section>}
    </main>
  );
}
