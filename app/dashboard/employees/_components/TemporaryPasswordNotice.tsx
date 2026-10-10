"use client";

import { useState } from "react";
import toast from "react-hot-toast";

import { useModalStore } from "@/store/useModalStore";

type Props = {
  name: string;
  email: string;
  temporaryPassword: string;
};

/** كلمة السر المؤقتة بتظهر هنا مرة واحدة بس — مش متخزنة في أي مكان */
export default function TemporaryPasswordNotice({ name, email, temporaryPassword }: Props) {
  const closeModal = useModalStore((state) => state.closeModal);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      toast.success("تم نسخ كلمة السر المؤقتة");
    } catch {
      toast.error("تعذر النسخ، انسخها يدويًا");
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <p className="text-sm text-gray-600">
        تم إنشاء حساب <strong className="text-gray-900">{name}</strong> ({email}). سلّم الموظف
        كلمة السر المؤقتة التالية؛ سيُطلب منه تغييرها عند أول تسجيل دخول.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <code dir="ltr" className="select-all font-mono text-lg font-bold tracking-wider text-gray-900">
          {temporaryPassword}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
        >
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>

      <p className="text-xs font-medium text-red-600">
        لن تظهر كلمة السر هذه مرة أخرى. إذا فُقدت، استخدم &quot;إعادة تعيين كلمة السر&quot; من
        قائمة الموظفين.
      </p>

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={closeModal}
          className="rounded-xl bg-(--primary-red) px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          تم، أغلق
        </button>
      </div>
    </div>
  );
}
