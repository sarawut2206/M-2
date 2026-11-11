import type { NextConfig } from "next";

// เว็บเป็นไฟล์ static บน GitHub Pages ที่ https://<user>.github.io/M-2/ จึงต้องมี basePath ตอน build จริง
// (ตอน npm run dev ไม่ใส่ เปิดที่ http://localhost:3000 ได้เลย) ถ้าเปลี่ยนชื่อ repository ให้ตั้ง NEXT_PUBLIC_BASE_PATH
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.NODE_ENV === "production" ? "/M-2" : "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true }
};

export default nextConfig;
