"use client";

import { useState } from "react";

export default function SessionExpiredActions({ loginHref }: { loginHref: string }) {
  const [busy, setBusy] = useState(false);

  // مسح أي كوكي متبقية من السيرفر قبل الرجوع لصفحة الدخول
  const endSession = async (target: string) => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      // حتى لو فشل، الكوكي اتمسحت من الـ proxy أصلًا
    }
    window.location.replace(target);
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => endSession(loginHref)}
        className="w-full rounded-2xl bg-(--primary-red) py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
      >
        تسجيل الدخول مرة أخرى
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => endSession("/")}
        className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        إنهاء الجلسة
      </button>
    </div>
  );
}
