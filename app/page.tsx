"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, clearPhotoCache, type Me } from "@/lib/api";
import { Editor } from "./components/Editor";
import { LoginForm } from "./components/LoginForm";

export default function Home() {
  const [me, setMe] = useState<Me | undefined>();

  const refresh = useCallback(async () => {
    try { setMe(await api.me()); }
    catch { setMe({ role: null }); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    api.logout(); clearPhotoCache();
    setMe({ role: null });
  }, []);

  if (!me) return <main className="login-wrap"><p className="muted">กำลังโหลด...</p></main>;
  if (me.role === "group") return <Editor group={me.group} onLogout={logout} />;
  if (me.role === "teacher") {
    return <main className="login-wrap"><div className="login-card"><p>คุณเข้าสู่ระบบเป็นครู</p><Link className="btn btn-primary" href="/teacher">ไปหน้าแดชบอร์ดครู</Link>
      <button className="btn btn-light" onClick={logout} style={{ marginTop: 8 }}>ออกจากระบบ</button></div></main>;
  }
  return <LoginForm onDone={refresh} />;
}
