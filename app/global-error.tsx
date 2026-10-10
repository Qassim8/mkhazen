"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/** آخر خط دفاع: خطأ في الـ root layout نفسه */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f9fafb", margin: 0 }}>
        <main
          style={{
            maxWidth: 420,
            margin: "15vh auto",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>حدث خطأ غير متوقع</h1>
          <p style={{ color: "#4b5563", fontSize: 14, margin: "0 0 16px" }}>
            تعذر تحميل النظام. لم يتم حفظ أي تغيير غير مكتمل. حاول مرة أخرى.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#111827",
              color: "#fff",
              border: 0,
              borderRadius: 12,
              padding: "10px 18px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
