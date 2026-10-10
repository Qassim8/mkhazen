"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * أي خطأ غير متوقع أثناء عرض صفحة في الداشبورد بيوصل هنا بدل صفحة
 * Next.js الافتراضية. الرسالة الأصلية بتتسجل في الكونسول بس (مش للمستخدم).
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error.digest ?? "", error);
  }, [error]);

  return (
    <div dir="rtl" className="mx-auto my-16 max-w-lg rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">تعذر عرض هذه الصفحة</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        حدث خطأ أثناء تحميل البيانات. لم يتم حفظ أي تغيير غير مكتمل. حاول مرة أخرى، وإذا تكرر
        الخطأ تواصل مع مسؤول النظام.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-gray-400" dir="ltr">
          ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-xl bg-(--primary-red) px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          إعادة المحاولة
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          الصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
