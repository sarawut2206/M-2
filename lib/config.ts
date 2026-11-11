// URL ของ Apps Script Web App (ลงท้ายด้วย /exec) — ไม่ใช่ความลับ ใส่ในโค้ดหรือตั้งผ่าน NEXT_PUBLIC_API_URL ตอน build ก็ได้
// ได้ URL นี้จาก Apps Script > ทำให้ใช้งานได้ > การทำให้ใช้งานได้ใหม่ > เว็บแอป
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL || "";
