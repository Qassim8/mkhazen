import type { Metadata } from "next";
import Link from "next/link";

import { safeReturnPath } from "@/lib/api-codes";
import SessionExpiredActions from "./SessionExpiredActions";

export const metadata: Metadata = {
  title: "انتهت الجلسة",
};

/**
 * الصفحة اللي بيتحول لها المستخدم لما جلسته تنتهي أثناء الشغل
 * (من الـ proxy عند فتح صفحة، أو من الواجهة لما الـ API يرد 401).
 * متاحة من غير تسجيل دخول، ومفيش منها أي تحويل تلقائي (مفيش حلقات).
 */
export default async function SessionExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const loginHref = next ? `/?next=${encodeURIComponent(next)}` : "/";

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gray-50/50 px-4 py-12">
      <main className="w-full max-w-md space-y-6 rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl" aria-hidden>
          ⏳
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">انتهت جلستك</h1>
          <p className="text-sm leading-6 text-gray-600">
            عذرًا، انتهت جلستك. سجّل الدخول مرة أخرى لمتابعة العمل.
          </p>
          <p className="text-xs leading-5 text-gray-500">
            أي عملية حاولت تنفيذها بعد انتهاء الجلسة لم تُحفظ. بعد تسجيل الدخول راجع البيانات
            قبل إعادة المحاولة؛ سلة الكاشير المفتوحة تُستعاد تلقائيًا في نفس النافذة.
          </p>
        </div>

        <SessionExpiredActions loginHref={loginHref} />

        <p className="text-xs text-gray-400">
          <Link href="/" className="underline-offset-2 hover:underline">
            الصفحة الرئيسية
          </Link>
        </p>
      </main>
    </div>
  );
}
