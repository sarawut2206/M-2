"use client";

import type { Draft, Project } from "@/lib/types";
import { PhotoImg } from "./PhotoImg";

function AutoText({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  if (!onChange) return <p>{value}</p>;
  return <textarea className="draft-text" rows={Math.max(2, Math.ceil(value.length / 55))} value={value} onChange={e => onChange(e.target.value)} />;
}

/** แสดงบทที่ 3; ถ้าส่ง onDraft จะแก้ข้อความในร่างได้ (นักเรียน) ถ้าไม่ส่งจะอ่านอย่างเดียว (ครู) */
export function ReportPreview({ project, onDraft }: { project: Project; onDraft?: (d: Draft) => void }) {
  const d = project.draft;
  if (!d) return null;
  const set = (patch: Partial<Draft>) => onDraft?.({ ...d, ...patch });
  const ed = (fn: (v: string) => void) => (onDraft ? fn : undefined);
  let fig = 0;
  const img = (id: string, caption: string) => { fig += 1; return <figure><PhotoImg id={id} alt={caption} /><figcaption>ภาพที่ 3.{fig} {caption}</figcaption></figure>; };
  const mats = project.materials.filter(m => m.name.trim());

  return (
    <article className="report">
      <h2>บทที่ 3</h2><h3>วิธีดำเนินการโครงงาน</h3>
      <h4>3.1 วัสดุและอุปกรณ์ที่ใช้ในการสร้างนวัตกรรม</h4>
      <AutoText value={d.materialsIntro} onChange={ed(v => set({ materialsIntro: v }))} />
      <table><thead><tr><th>ลำดับ</th><th>วัสดุและอุปกรณ์</th><th>จำนวน</th><th>หน้าที่การใช้งาน</th></tr></thead>
        <tbody>{mats.map((m, i) => <tr key={m.id}><td>{i + 1}</td><td>{m.name}</td><td>{m.qty} {m.unit}</td><td>{m.role}</td></tr>)}</tbody></table>
      {mats.map(m => m.photo && <div key={m.id}>{img(m.photo.id, `วัสดุหรืออุปกรณ์ ${m.name}`)}</div>)}
      <h4>3.2 การออกแบบและวางแผนการสร้างนวัตกรรม</h4>
      <AutoText value={d.design} onChange={ed(v => set({ design: v }))} />
      <h4>3.3 ขั้นตอนการสร้างนวัตกรรม</h4>
      {d.steps.map((s, i) => {
        const src = project.steps.find(x => x.id === s.sourceStepId);
        return <div key={i}><b>ขั้นตอนที่ {i + 1} {s.title}</b>
          <AutoText value={s.paragraph} onChange={ed(v => set({ steps: d.steps.map((x, j) => j === i ? { ...x, paragraph: v } : x) }))} />
          {src?.photo && img(src.photo.id, src.title || s.title)}</div>;
      })}
      <h4>3.4 การทดลองใช้งานและตรวจสอบประสิทธิภาพ</h4>
      <AutoText value={d.testing} onChange={ed(v => set({ testing: v }))} />
      <h4>3.5 การปรับปรุงและพัฒนานวัตกรรม</h4>
      <AutoText value={d.improvement} onChange={ed(v => set({ improvement: v }))} />
    </article>
  );
}
