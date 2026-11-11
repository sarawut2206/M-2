import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, ImageRun, BorderStyle, LineRuleType, TableLayoutType, VerticalAlign, type FileChild
} from "docx";
import { TEMPLATE as T, cmToTwip, ptToHalf } from "./docTemplate";
import type { Photo, Project } from "./types";

export type PhotoLoader = (photo: Photo) => Promise<Uint8Array | null>;

const FONT = { ascii: T.font, hAnsi: T.font, cs: T.font, eastAsia: T.font };
const LINE = { line: Math.round(240 * T.lineSpacing), lineRule: LineRuleType.AUTO };
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function run(text: string, o: { pt?: number; bold?: boolean; italics?: boolean } = {}) {
  // ตั้งทั้งชุดละติน (ascii/hAnsi) และชุดอักษรไทย (cs) รวมถึงขนาด/ตัวหนาของชุดไทย
  return new TextRun({
    text, font: FONT, size: ptToHalf(o.pt ?? T.bodyPt), sizeComplexScript: ptToHalf(o.pt ?? T.bodyPt),
    bold: o.bold, boldComplexScript: o.bold, italics: o.italics, italicsComplexScript: o.italics
  });
}

function body(text: string, o: { indent?: boolean; bold?: boolean } = {}) {
  // แยกย่อหน้าตามบรรทัดว่างที่นักเรียนพิมพ์
  return (text || "-").split(/\n+/).filter(s => s.trim()).map(line => new Paragraph({
    alignment: AlignmentType.THAI_DISTRIBUTE,
    spacing: { ...LINE, after: 0 },
    indent: o.indent === false ? undefined : { firstLine: cmToTwip(T.paragraphIndentCm) },
    children: [run(line.trim(), { bold: o.bold })]
  }));
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, keepNext: true,
    spacing: { ...LINE, before: 240, after: 60 },
    children: [run(text, { pt: T.h1Pt, bold: true })]
  });
}

function fitImage(p: Photo) {
  const maxW = (T.imageMaxCm.w / 2.54) * 96, maxH = (T.imageMaxCm.h / 2.54) * 96; // พิกเซลที่ 96 dpi
  const w = Math.max(1, p.w || 4), h = Math.max(1, p.h || 3);
  const k = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** สร้างไฟล์ Word ในเบราว์เซอร์ (ใช้ได้ทั้งนักเรียนและครู) */
export async function buildDocx(p: Project, loadPhoto: PhotoLoader): Promise<Blob> {
  const d = p.draft;
  const children: FileChild[] = [];
  let figNo = 0;

  async function picture(photo: Photo | undefined, caption: string) {
    if (!photo) return;
    const data = await loadPhoto(photo);
    if (!data) return;
    figNo += 1;
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { ...LINE, before: 120, after: 40 },
      children: [new ImageRun({ type: "jpg", data, transformation: fitImage(photo), altText: { name: caption, title: caption, description: caption } })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { ...LINE, after: 160 },
      children: [run(`ภาพที่ 3.${figNo} ${caption}`, { pt: T.captionPt })]
    }));
  }

  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...LINE, after: 0 }, children: [run("บทที่ 3", { pt: T.chapterNoPt, bold: true })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...LINE, after: 240 }, children: [run("วิธีดำเนินการโครงงาน", { pt: T.chapterTitlePt, bold: true })] }));

  children.push(new Paragraph({ spacing: { ...LINE, after: 0 }, children: [run(`ชื่อโครงงาน: ${p.projectTitle || "-"}`, { bold: true })] }));
  children.push(new Paragraph({ spacing: { ...LINE, after: 120 }, children: [run(`ห้อง ${p.classroom || "-"}  กลุ่มที่ ${p.groupNo || "-"}${p.groupName ? `  ${p.groupName}` : ""}`)] }));

  children.push(heading("3.1 วัสดุและอุปกรณ์ที่ใช้ในการสร้างนวัตกรรม"));
  children.push(...body(d?.materialsIntro ?? "ยังไม่มีข้อมูล"));

  const widths = [800, 2900, 1400, 3200]; // รวม ≈ ความกว้างพื้นที่พิมพ์
  const cell = (text: string, w: number, center = false, head = false) => new TableCell({
    borders: cellBorders, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    shading: head ? { fill: "EDEDED" } : undefined,
    children: [new Paragraph({ alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { ...LINE, after: 0 }, children: [run(text, { pt: T.tablePt, bold: head })] })]
  });
  const mats = p.materials.filter(m => m.name.trim());
  children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  children.push(new Table({
    width: { size: widths.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: ["ลำดับ", "วัสดุและอุปกรณ์", "จำนวน", "หน้าที่การใช้งาน"].map((t, i) => cell(t, widths[i], true, true)) }),
      ...(mats.length ? mats : [{ name: "-", qty: "", unit: "", role: "-" }]).map((m, i) => new TableRow({
        cantSplit: true,
        children: [cell(String(i + 1), widths[0], true), cell(m.name, widths[1]), cell(`${m.qty} ${m.unit}`.trim() || "-", widths[2], true), cell(m.role || "-", widths[3])]
      }))
    ]
  }));
  children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  for (const m of mats) await picture(m.photo, `วัสดุหรืออุปกรณ์ ${m.name}`);

  children.push(heading("3.2 การออกแบบและวางแผนการสร้างนวัตกรรม"));
  children.push(...body(d?.design || p.design || "ยังไม่มีข้อมูล"));

  children.push(heading("3.3 ขั้นตอนการสร้างนวัตกรรม"));
  let i = 0;
  for (const s of d?.steps ?? []) {
    i += 1;
    children.push(new Paragraph({ keepNext: true, spacing: { ...LINE, before: 120, after: 0 }, children: [run(`ขั้นตอนที่ ${i} ${s.title || ""}`.trim(), { bold: true })] }));
    children.push(...body(s.paragraph));
    const original = p.steps.find(x => x.id === s.sourceStepId);
    await picture(original?.photo, original?.title || s.title || "ขั้นตอนการสร้างนวัตกรรม");
  }
  if (!d?.steps?.length) children.push(...body("ยังไม่มีข้อมูล"));

  children.push(heading("3.4 การทดลองใช้งานและตรวจสอบประสิทธิภาพ"));
  children.push(...body(d?.testing ?? "ยังไม่มีข้อมูลการทดลอง"));
  children.push(heading("3.5 การปรับปรุงและพัฒนานวัตกรรม"));
  children.push(...body(d?.improvement ?? "ยังไม่มีข้อมูลการปรับปรุง"));

  const heading1 = { run: { font: FONT, size: ptToHalf(T.h1Pt), sizeComplexScript: ptToHalf(T.h1Pt), bold: true, boldComplexScript: true, color: "000000" } };
  const doc = new Document({
    creator: "IS Smart Writer", title: `บทที่ 3 ${p.projectTitle || ""}`.trim(),
    styles: {
      default: {
        document: { run: { font: FONT, size: ptToHalf(T.bodyPt), sizeComplexScript: ptToHalf(T.bodyPt), language: { value: "en-US", bidirectional: "th-TH" } } },
        heading1
      }
    },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: { top: cmToTwip(T.marginCm.top), left: cmToTwip(T.marginCm.left), right: cmToTwip(T.marginCm.right), bottom: cmToTwip(T.marginCm.bottom) }
      } },
      children
    }]
  });
  return Packer.toBlob(doc);
}
