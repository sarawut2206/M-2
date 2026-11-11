"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { NUM_GROUPS } from "@/lib/types";

export function LoginForm({ onDone }: { onDone: () => void }) {
  const [group, setGroup] = useState("1");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.loginGroup(Number(group), pin);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally { setBusy(false); }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-icon">IS</div>
        <h1>IS Smart Writer</h1>
        <p className="muted">เข้าสู่ระบบด้วยหมายเลขกลุ่มและรหัส PIN 6 หลักที่ครูให้</p>
        <label className="field"><span className="field-label">กลุ่มของฉัน</span>
          <select value={group} onChange={e => setGroup(e.target.value)}>
            {Array.from({ length: NUM_GROUPS }, (_, i) => <option key={i + 1} value={i + 1}>กลุ่ม {i + 1}</option>)}
          </select></label>
        <label className="field"><span className="field-label">รหัส PIN</span>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="______" className="pin-input" /></label>
        {error && <div className="warning">{error}</div>}
        <button className="btn btn-primary" disabled={busy || pin.length !== 6} style={{ width: "100%", marginTop: 8 }}>{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
        <Link className="login-link" href="/teacher">สำหรับคุณครู</Link>
      </form>
    </main>
  );
}
