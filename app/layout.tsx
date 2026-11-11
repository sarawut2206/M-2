import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IS Smart Writer",
  description: "ระบบช่วยจัดทำรายงานโครงงาน IS สำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 2"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
