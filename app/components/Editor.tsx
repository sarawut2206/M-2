"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, primePhoto } from "@/lib/api";
import { downloadChapter3 } from "@/lib/exportWord";
import { blankProject, calcProgress, newId, type Draft, type Photo, type Project, type ProjectRow } from "@/lib/types";
import { PhotoImg } from "./PhotoImg";
import { ReportPreview } from "./ReportPreview";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{hint && <span className="hint">{hint}</span>}{children}</label>;
}

/** ย่อรูปจากโทรศัพท์เป็น JPEG ไม่เกิน 1500px ก่อนอัปโหลด (รวมถึง HEIC หากเบราว์เซอร์อ่านได้) */
async function fileToJpeg(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1500 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("ไม่สามารถประมวลผลรูปภาพได้"));
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // PNG โปร่งใสให้พื้นขาว
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.78), w: canvas.width, h: canvas.height });
    };
    img.onerror = () => reject(new Error("เบราว์เซอร์ไม่สามารถอ่านรูปภาพนี้ได้ กรุณาแปลงเป็น JPG หรือ PNG"));
    img.src = raw;
  });
}

type SaveState = "saved" | "saving" | "dirty" | "error";

export function Editor({ group, onLogout }: { group: number; onLogout: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [meta, setMeta] = useState<{ status: ProjectRow["status"]; comment: string }>({ status: "draft", comment: "" });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"form" | "preview">("form");

  const version = useRef(0);
  const latest = useRef<Project | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);

  // โหลดข้อมูลของกลุ่มจากระบบ
  useEffect(() => {
    (async () => {
      try {
        const row = await api.getProject();
        const p = row?.data ?? blankProject(group);
        version.current = row?.version ?? 0;
        latest.current = p;
        setProject(p);
        setMeta({ status: row?.status ?? "draft", comment: row?.teacherComment ?? "" });
      } catch (e) {
        if (e instanceof ApiError && e.code === "UNAUTHORIZED") return onLogout();
        setNotice(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า");
      }
    })();
  }, [group, onLogout]);

  const save = useCallback(async (opts: { submit?: boolean; force?: boolean } = {}): Promise<boolean> => {
    if (saving.current || !latest.current) return false;
    saving.current = true; setSaveState("saving");
    const sent = latest.current;
    dirty.current = false;
    try {
      const row = await api.saveProject(sent, version.current, opts);
      version.current = row.version;
      setMeta(m => ({ ...m, status: row.status }));
      setSaveState(dirty.current ? "dirty" : "saved");
      return true;
    } catch (e) {
      dirty.current = true;
      if (e instanceof ApiError && e.code === "UNAUTHORIZED") { onLogout(); return false; }
      if (e instanceof ApiError && e.code === "CONFLICT" && e.row) { setConflict(e.row); setSaveState("error"); return false; }
      if (e instanceof ApiError && e.code === "TOO_LARGE") { setNotice(e.message); setSaveState("error"); return false; }
      setSaveState("error");
      return false;
    } finally { saving.current = false; }
  }, [onLogout]);

  // บันทึกอัตโนมัติหลังหยุดพิมพ์ 1 วินาที (และลองใหม่ทุก 5 วินาทีหากบันทึกไม่สำเร็จ)
  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "error") return;
    if (conflict) return;
    const t = window.setTimeout(() => { if (dirty.current) save(); }, saveState === "error" ? 5000 : 1000);
    return () => window.clearTimeout(t);
  }, [saveState, project, conflict, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function apply(fn: (p: Project) => Project) {
    setProject(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      latest.current = next; dirty.current = true;
      return next;
    });
    setSaveState(s => (s === "saving" ? "saving" : "dirty"));
  }
  const update = <K extends keyof Project>(key: K, value: Project[K]) => apply(p => ({ ...p, [key]: value }));
  const patchMaterial = (id: string, patch: object) => apply(p => ({ ...p, materials: p.materials.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const patchStep = (id: string, patch: object) => apply(p => ({ ...p, steps: p.steps.map(s => s.id === id ? { ...s, ...patch } : s) }));

  const progress = useMemo(() => (project ? calcProgress(project) : 0), [project]);

  async function addPhoto(kind: "material" | "step", id: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice("กรุณาเลือกไฟล์รูปภาพ"); return; }
    if (file.size > 15 * 1024 * 1024) { setNotice("รูปภาพมีขนาดเกิน 15 MB กรุณาเลือกรูปที่เล็กลง"); return; }
    setNotice("กำลังอัปโหลดรูปภาพ...");
    try {
      const { dataUrl, w, h } = await fileToJpeg(file);
      const photoId = await api.uploadPhoto(dataUrl);
      primePhoto(photoId, dataUrl);
      const photo: Photo = { id: photoId, w, h, name: file.name };
      if (kind === "material") patchMaterial(id, { photo }); else patchStep(id, { photo });
      setNotice("เพิ่มรูปภาพแล้ว");
    } catch (e) { setNotice(e instanceof Error ? e.message : "อัปโหลดรูปภาพไม่สำเร็จ"); }
  }

  async function createDraft() {
    if (!project) return;
    setBusy(true); setNotice("กำลังเรียบเรียงข้อมูล...");
    try {
      const data = await api.draft(project);
      update("draft", data.draft);
      setTab("preview");
      setNotice(data.mode === "fallback" ? "สร้างร่างเบื้องต้นแล้ว (ยังไม่ได้เชื่อมต่อ AI)" : "AI เรียบเรียงร่างรายงานเรียบร้อยแล้ว กรุณาตรวจและแก้ไขข้อความก่อนส่ง");
    } catch (e) { setNotice(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }

  async function exportWord() {
    setBusy(true); setNotice("กำลังสร้างไฟล์ Word...");
    try {
      if (!project) return;
      await downloadChapter3(project, group); // สร้างไฟล์ในเบราว์เซอร์จากข้อมูลล่าสุดบนหน้าจอ
      setNotice("ดาวน์โหลดไฟล์ Word แล้ว");
    } catch (e) { setNotice(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    finally { setBusy(false); }
  }

  async function submitToTeacher() {
    if (!project?.draft) { setNotice("กรุณาสร้างร่างบทที่ 3 ก่อนส่งงาน"); return; }
    if (!confirm("ส่งงานให้ครูตรวจใช่หรือไม่? (หลังส่งยังแก้ไขได้ แต่สถานะจะกลับเป็น “กำลังทำ”)")) return;
    setBusy(true);
    const ok = await save({ submit: true });
    setBusy(false);
    setNotice(ok ? "ส่งงานให้ครูเรียบร้อยแล้ว" : "ส่งงานไม่สำเร็จ กรุณาลองอีกครั้ง");
  }

  async function useServerVersion() {
    if (!conflict) return;
    version.current = conflict.version; latest.current = conflict.data; dirty.current = false;
    setProject(conflict.data); setMeta({ status: conflict.status, comment: conflict.teacherComment });
    setConflict(null); setSaveState("saved");
  }
  async function overwriteServer() {
    setConflict(null);
    await save({ force: true });
  }

  function resetProject() {
    if (!confirm("ต้องการล้างข้อมูลโครงงานของกลุ่มนี้ทั้งหมดหรือไม่? การกระทำนี้ย้อนกลับไม่ได้ และจะมีผลกับสมาชิกทุกคนในกลุ่ม")) return;
    const p = blankProject(group);
    latest.current = p; dirty.current = true;
    setProject(p); setSaveState("dirty"); setTab("form"); setNotice("ล้างข้อมูลแล้ว");
  }

  if (!project) return <main className="login-wrap"><p className="muted">{notice || "กำลังโหลดข้อมูลกลุ่ม..."}</p></main>;

  const saveLabel = { saved: "บันทึกขึ้นระบบแล้ว", saving: "กำลังบันทึก...", dirty: "มีการแก้ไข กำลังจะบันทึก...", error: "บันทึกไม่สำเร็จ กำลังลองใหม่" }[saveState];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">IS</div>
          <div><strong>IS Smart Writer</strong><small>กลุ่ม {group} · {meta.status === "submitted" ? "ส่งงานแล้ว" : "กำลังทำ"}</small></div>
        </div>
        <div className="top-actions"><span className={`saved ${saveState === "error" ? "bad" : ""}`}>{notice || saveLabel}</span>
          <button className="btn btn-light" onClick={resetProject}>เริ่มใหม่</button>
          <button className="btn btn-light" onClick={async () => { if (dirty.current) await save(); onLogout(); }}>ออกจากระบบ</button></div>
      </header>

      {conflict && <div className="warning conflict"><b>มีสมาชิกในกลุ่มบันทึกข้อมูลที่ใหม่กว่าไปแล้ว</b>
        <p>ถ้าใช้ข้อมูลล่าสุดจากระบบ สิ่งที่คุณเพิ่งแก้บนหน้านี้จะหายไป ถ้าบันทึกทับ งานของเพื่อนที่เพิ่งบันทึกจะหายไป</p>
        <div className="row"><button className="btn btn-primary" onClick={useServerVersion}>ใช้ข้อมูลล่าสุดจากระบบ</button>
          <button className="btn btn-outline" onClick={overwriteServer}>บันทึกทับด้วยข้อมูลของฉัน</button></div></div>}

      {meta.comment && <div className="teacher-note"><b>ข้อความจากครู</b><p>{meta.comment}</p></div>}

      <section className="hero">
        <div>
          <span className="eyebrow">สำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 2</span>
          <h1>เปลี่ยนสิ่งที่ลงมือทำ<br /><em>ให้เป็นรายงานที่สมบูรณ์</em></h1>
          <p>เล่าด้วยภาษาของตัวเอง แนบภาพการสร้างจริง แล้วให้ระบบช่วยเรียบเรียงเป็นบทที่ 3</p>
        </div>
        <div className="progress-card">
          <div className="progress-head"><span>ความครบถ้วนของข้อมูล</span><strong>{progress}%</strong></div>
          <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          <small>ข้อมูลบันทึกขึ้นระบบอัตโนมัติ สมาชิกในกลุ่มเปิดจากเครื่องไหนก็เห็นข้อมูลเดียวกัน</small>
        </div>
      </section>

      <div className="tabs">
        <button className={tab === "form" ? "active" : ""} onClick={() => setTab("form")}>1. กรอกข้อมูลโครงงาน</button>
        <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>2. ตรวจร่างและส่งออก</button>
      </div>

      {tab === "form" ? <div className="layout">
        <aside className="side">
          <div className="side-card">
            <strong>ขั้นตอนการทำงาน</strong>
            <ol><li>ข้อมูลโครงงาน</li><li>วัสดุและอุปกรณ์</li><li>ขั้นตอนการสร้าง</li><li>ทดลองและปรับปรุง</li><li>สร้างรายงาน Word</li></ol>
            <div className="tip"><b>เคล็ดลับ</b><br />ไม่ต้องเขียนเป็นภาษาทางการ แค่เล่าว่าทำอะไรจริง ๆ ก็พอ</div>
          </div>
        </aside>

        <div className="content">
          <section className="panel">
            <div className="section-head"><div><span className="step-no">01</span><h2>ข้อมูลโครงงาน</h2></div><span className="required">ข้อมูลพื้นฐาน</span></div>
            <div className="grid two">
              <Field label="ห้องเรียน"><input value={project.classroom} onChange={e => update("classroom", e.target.value)} placeholder="เช่น ม.2/3" /></Field>
              <Field label="หมายเลขกลุ่ม"><input value={`กลุ่ม ${group}`} disabled /></Field>
              <Field label="ชื่อกลุ่ม"><input value={project.groupName} onChange={e => update("groupName", e.target.value)} placeholder="เช่น กลุ่มนักประดิษฐ์" /></Field>
              <Field label="ประเภทนวัตกรรม"><select value={project.projectType} onChange={e => update("projectType", e.target.value)}><option>สิ่งประดิษฐ์</option><option>แอปพลิเคชัน / โปรแกรม</option><option>สื่อ / นวัตกรรมการเรียนรู้</option><option>ผลิตภัณฑ์</option><option>อื่น ๆ</option></select></Field>
            </div>
            <Field label="ชื่อโครงงาน"><input value={project.projectTitle} onChange={e => update("projectTitle", e.target.value)} placeholder="เช่น เครื่องใส่ถุงเท้าสำหรับผู้สูงอายุ" /></Field>
            <Field label="ปัญหาที่ต้องการแก้ไข" hint="เล่าว่าพบปัญหาอะไร จึงคิดสร้างนวัตกรรมนี้"><textarea rows={3} value={project.problem} onChange={e => update("problem", e.target.value)} placeholder="เช่น ผู้สูงอายุบางคนก้มตัวใส่ถุงเท้าได้ลำบาก..." /></Field>
            <Field label="วัตถุประสงค์ของนวัตกรรม"><textarea rows={2} value={project.objectives} onChange={e => update("objectives", e.target.value)} placeholder="เช่น เพื่อสร้างอุปกรณ์ช่วยให้ใส่ถุงเท้าได้สะดวกขึ้น..." /></Field>
            <Field label="แนวคิดหรือรูปแบบการออกแบบ" hint="อธิบายรูปร่าง ส่วนประกอบ หรือหลักการทำงานตามที่กลุ่มออกแบบจริง"><textarea rows={3} value={project.design} onChange={e => update("design", e.target.value)} placeholder="อธิบายแนวคิดของชิ้นงานด้วยภาษาของตัวเอง..." /></Field>
          </section>

          <section className="panel">
            <div className="section-head"><div><span className="step-no">02</span><h2>วัสดุและอุปกรณ์</h2></div>
              <button className="btn btn-outline" onClick={() => apply(p => ({ ...p, materials: [...p.materials, { id: newId(), name: "", qty: "", unit: "ชิ้น", role: "" }] }))}>＋ เพิ่มรายการ</button></div>
            <p className="muted">ระบุวัสดุที่ใช้จริง และหน้าที่ของวัสดุแต่ละชนิด</p>
            {project.materials.map((m, i) => <div className="repeat-card" key={m.id}>
              <div className="repeat-title"><b>รายการที่ {i + 1}</b><button className="remove" onClick={() => apply(p => ({ ...p, materials: p.materials.filter(x => x.id !== m.id) }))}>ลบ</button></div>
              <div className="grid three">
                <Field label="ชื่อวัสดุ / อุปกรณ์"><input value={m.name} onChange={e => patchMaterial(m.id, { name: e.target.value })} placeholder="เช่น ท่อ PVC" /></Field>
                <Field label="จำนวน"><input value={m.qty} onChange={e => patchMaterial(m.id, { qty: e.target.value })} placeholder="เช่น 2" /></Field>
                <Field label="หน่วย"><input value={m.unit} onChange={e => patchMaterial(m.id, { unit: e.target.value })} placeholder="ชิ้น / เมตร" /></Field>
              </div>
              <Field label="ใช้ทำอะไร"><input value={m.role} onChange={e => patchMaterial(m.id, { role: e.target.value })} placeholder="เช่น ใช้เป็นโครงสร้างของอุปกรณ์" /></Field>
              <div className="upload-row">
                <label className="upload-btn">＋ แนบภาพวัสดุ<input type="file" accept="image/*" onChange={e => { addPhoto("material", m.id, e.target.files?.[0]); e.target.value = ""; }} /></label>
                {m.photo && <><PhotoImg className="thumb" id={m.photo.id} alt="ภาพวัสดุ" /><small>{m.photo.name}</small>
                  <button className="remove" onClick={() => patchMaterial(m.id, { photo: undefined })}>เอารูปออก</button></>}
              </div>
            </div>)}
          </section>

          <section className="panel">
            <div className="section-head"><div><span className="step-no">03</span><h2>ขั้นตอนการสร้างนวัตกรรม</h2></div>
              <button className="btn btn-outline" onClick={() => apply(p => ({ ...p, steps: [...p.steps, { id: newId(), title: `ขั้นตอนที่ ${p.steps.length + 1}`, action: "", materials: "", detail: "" }] }))}>＋ เพิ่มขั้นตอน</button></div>
            <p className="muted">เขียนตามลำดับที่ลงมือทำจริง แต่ละขั้นตอนสามารถแนบภาพได้</p>
            {project.steps.map((s, i) => <div className="repeat-card" key={s.id}>
              <div className="repeat-title"><b>ขั้นตอนที่ {i + 1}</b><button className="remove" onClick={() => apply(p => ({ ...p, steps: p.steps.filter(x => x.id !== s.id) }))}>ลบ</button></div>
              <Field label="ชื่อขั้นตอน"><input value={s.title} onChange={e => patchStep(s.id, { title: e.target.value })} placeholder="เช่น การตัดท่อ PVC" /></Field>
              <Field label="ทำอะไรในขั้นตอนนี้?" hint="เล่าเป็นภาษาพูดได้"><textarea rows={2} value={s.action} onChange={e => patchStep(s.id, { action: e.target.value })} placeholder="เช่น นำท่อ PVC มาตัดให้ได้ความยาวตามที่ต้องการ" /></Field>
              <Field label="ใช้วัสดุ / อุปกรณ์อะไร"><input value={s.materials} onChange={e => patchStep(s.id, { materials: e.target.value })} placeholder="เช่น ท่อ PVC เลื่อย กรรไกร" /></Field>
              <Field label="รายละเอียดเพิ่มเติม (ถ้ามี)"><textarea rows={2} value={s.detail} onChange={e => patchStep(s.id, { detail: e.target.value })} placeholder="เช่น ตัดให้มีความยาวเท่ากัน 2 ชิ้น..." /></Field>
              <div className="upload-row">
                <label className="upload-btn">＋ แนบภาพขั้นตอนนี้<input type="file" accept="image/*" onChange={e => { addPhoto("step", s.id, e.target.files?.[0]); e.target.value = ""; }} /></label>
                {s.photo && <><PhotoImg className="thumb" id={s.photo.id} alt="ภาพขั้นตอน" /><small>{s.photo.name}</small>
                  <button className="remove" onClick={() => patchStep(s.id, { photo: undefined })}>เอารูปออก</button></>}
              </div>
            </div>)}
          </section>

          <section className="panel">
            <div className="section-head"><div><span className="step-no">04</span><h2>การทดลองและการปรับปรุง</h2></div><span className="required">ตอบตามจริง</span></div>
            <Field label="ทดลองใช้งานอย่างไร?"><textarea rows={2} value={project.testMethod} onChange={e => update("testMethod", e.target.value)} placeholder="เช่น นำอุปกรณ์ไปทดลองใช้กับ..." /></Field>
            <div className="grid two">
              <Field label="ทดลองกี่ครั้ง"><input value={project.testCount} onChange={e => update("testCount", e.target.value)} placeholder="เช่น 3 ครั้ง" /></Field>
              <Field label="ผลการทดลอง"><select value={project.testResult} onChange={e => update("testResult", e.target.value)}><option value="">เลือกผลการทดลอง</option><option>ใช้งานได้ตามวัตถุประสงค์</option><option>ใช้งานได้บางส่วน</option><option>ยังใช้งานไม่ได้</option><option>ต้องปรับปรุงเพิ่มเติม</option></select></Field>
            </div>
            <Field label="ผลที่สังเกตได้ / รายละเอียดผลทดลอง"><textarea rows={3} value={project.testObservation} onChange={e => update("testObservation", e.target.value)} placeholder="บรรยายสิ่งที่เกิดขึ้นจริงจากการทดลอง" /></Field>
            <Field label="พบปัญหาอะไรระหว่างการสร้างหรือทดลอง?"><textarea rows={2} value={project.problems} onChange={e => update("problems", e.target.value)} placeholder="เช่น ชิ้นส่วนหลวม หรืออุปกรณ์ยังใช้งานไม่สะดวก..." /></Field>
            <Field label="แก้ไขหรือปรับปรุงอย่างไร?"><textarea rows={2} value={project.improvements} onChange={e => update("improvements", e.target.value)} placeholder="เช่น เพิ่มจุดยึดให้แน่นขึ้น..." /></Field>
          </section>

          <div className="bottom-actions">
            <span>{saveLabel}</span>
            <button className="btn btn-primary" disabled={busy} onClick={createDraft}>{busy ? "กำลังทำงาน..." : "✨ สร้างร่างบทที่ 3"}</button>
          </div>
        </div>
      </div> : <div className="preview-wrap">
        <section className="panel preview-panel">
          <div className="section-head"><div><span className="step-no">05</span><h2>ตรวจร่างรายงานบทที่ 3</h2></div><button className="btn btn-outline" onClick={() => setTab("form")}>กลับไปแก้ข้อมูล</button></div>
          {!project.draft ? <div className="empty"><div>✍️</div><h3>ยังไม่มีร่างรายงาน</h3><p>กลับไปกรอกข้อมูล แล้วกด “สร้างร่างบทที่ 3”</p><button className="btn btn-primary" onClick={() => setTab("form")}>กรอกข้อมูลโครงงาน</button></div> : <>
            {project.draft.missingInfo?.length > 0 && <div className="warning"><b>ข้อมูลที่ควรตรวจสอบเพิ่มเติม</b><ul>{project.draft.missingInfo.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            <p className="muted">อ่านแต่ละย่อหน้าให้ตรงกับสิ่งที่ทำจริง แก้ข้อความในช่องได้เลย ถ้าแก้ข้อมูลในหน้ากรอกข้อมูลแล้ว ให้กด “สร้างร่างบทที่ 3” ใหม่</p>
            <ReportPreview project={project} onDraft={(d: Draft) => update("draft", d)} />
            <div className="bottom-actions">
              <button className="btn btn-outline" onClick={() => setTab("form")}>แก้ไขข้อมูล</button>
              <div className="row"><button className="btn btn-outline" disabled={busy} onClick={submitToTeacher}>📤 ส่งงานให้ครู</button>
                <button className="btn btn-primary" disabled={busy} onClick={exportWord}>⬇ ดาวน์โหลดไฟล์ Word (.docx)</button></div>
            </div>
          </>}
        </section>
      </div>}
      <footer>IS Smart Writer · ข้อมูลตัวอย่างต้องตรวจสอบกับการลงมือทำจริงก่อนส่งครู</footer>
    </main>
  );
}
