"use client";

import { useEffect, useState } from "react";
import { fetchPhoto } from "@/lib/api";

/** โหลดรูปจาก Apps Script ด้วยโทเคนของผู้ใช้ (รูปไม่เปิดเป็นสาธารณะ จึงใช้ <img src=URL> ตรง ๆ ไม่ได้) */
export function PhotoImg({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null); setFailed(false);
    fetchPhoto(id).then(s => alive && setSrc(s)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);
  if (failed) return <span className="photo-missing">โหลดรูปไม่สำเร็จ</span>;
  if (!src) return <span className="photo-loading" aria-label="กำลังโหลดรูป" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
