"use client";

import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 🔴 1. التعامل مع زر الرجوع عبر الـ BFCache الخاص بالمتصفح
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // إذا استرجعت الصفحة من ذاكرة المتصفح، نجبره على إعادة التحميل للتحقق من السيرفر
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return <>{children}</>;
}
