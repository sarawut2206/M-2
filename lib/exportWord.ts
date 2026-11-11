import { fetchPhoto } from "./api";
import type { Project } from "./types";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** สร้างบทที่ 3 เป็นไฟล์ .docx ในเบราว์เซอร์แล้วดาวน์โหลดทันที (โหลดไลบรารี docx เมื่อกดครั้งแรกเท่านั้น) */
export async function downloadChapter3(project: Project, group: number): Promise<void> {
  if (!project.draft) throw new Error("ยังไม่มีร่างรายงาน กรุณากด “สร้างร่างบทที่ 3” ก่อน");
  const { buildDocx } = await import("./buildDocx");
  const blob = await buildDocx(project, async photo => {
    try { return dataUrlToBytes(await fetchPhoto(photo.id)); } catch { return null; }
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `บทที่3_กลุ่ม${group}_${(project.projectTitle || "โครงงาน_IS").replace(/[^\p{L}\p{N}_-]+/gu, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
