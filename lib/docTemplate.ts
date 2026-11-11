// รูปแบบเอกสาร Word — ค่าชั่วคราวตามธรรมเนียมรายงานไทย
// เมื่อได้ไฟล์ตัวอย่างรายงาน IS ของโรงเรียนแล้ว ให้แก้ค่าในไฟล์นี้ให้ตรงกับแม่แบบ (ไม่ต้องแก้ที่อื่น)
export const TEMPLATE = {
  font: "TH Sarabun New",
  bodyPt: 16,
  chapterNoPt: 20,    // "บทที่ 3"
  chapterTitlePt: 20, // "วิธีดำเนินการโครงงาน"
  h1Pt: 18,           // 3.1, 3.2 ...
  tablePt: 16,
  captionPt: 16,
  lineSpacing: 1.0,   // เท่าของบรรทัดปกติ (Word "Single" = 1.0) ตัวอักษร TH Sarabun มีช่องไฟพอแล้ว
  paragraphIndentCm: 1.25,
  // ระยะขอบ (ซม.): ซ้าย 3.81 (1.5 นิ้ว) บน 3.81 ขวา/ล่าง 2.54 — แบบรายงานมาตรฐาน
  marginCm: { top: 3.81, left: 3.81, right: 2.54, bottom: 2.54 },
  // รูปภาพ: ความกว้าง/สูงสูงสุด (ซม.)
  imageMaxCm: { w: 11, h: 8 }
};

export const cmToTwip = (cm: number) => Math.round((cm / 2.54) * 1440);
export const ptToHalf = (pt: number) => Math.round(pt * 2);
