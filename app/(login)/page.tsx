"use client";

import { redirect } from "next/navigation";
import { useState } from "react";
import { LuStore, LuLock, LuMail, LuEye, LuEyeOff } from "react-icons/lu";

export default function LoginPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log("إرسال البيانات إلى الـ Server Action:", formData);
      // هنا مستقبلاً ستستدعي الـ loginAction(formData) الخاص ببريسما والكوكيز
      alert("جاري التحقق من الحساب والانتقال للوحة التحكم...");
    } catch (error) {
      alert("خطأ في بيانات الدخول!");
    } finally {
      setLoading(false);
    }

    redirect("/dashboard");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12"
      dir="rtl"
    >
      {/* الحاوية الرئيسية النظيفة بظل خفيف جداً وناعم border-gray-100 */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-6">
        {/* الشعار والترويسية */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuStore className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-black text-gray-950 mt-4">
            تسجيل الدخول للنظام
          </h1>
        </div>

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* حقل البريد الإلكتروني */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              البريد الإلكتروني للموظف
            </label>
            <div className="relative">
              <LuMail className="absolute right-4 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="name@store.com"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-4 pr-11 py-3 text-xs text-gray-900 font-semibold focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
              />
            </div>
          </div>

          {/* حقل كلمة المرور */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <LuLock className="absolute right-4 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-11 pr-11 py-3 text-xs text-gray-900 font-semibold focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
              />
              {/* زر إظهار وإخفاء كلمة المرور */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-3.5 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? (
                  <LuEyeOff className="h-4 w-4" />
                ) : (
                  <LuEye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-gray-500">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-(--primary-red) focus:ring-(--primary-red) h-3.5 w-3.5"
              />
              <span>تذكرني على هذا الجهاز</span>
            </label>
            <button
              type="button"
              className="text-(--primary-red) hover:underline"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-950 py-3 text-xs font-bold text-white shadow-sm hover:bg-gray-900 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer pt-3.5"
          >
            {loading ? "جاري التحقق من البيانات..." : "دخول إلى لوحة التحكم"}
          </button>
        </form>
      </div>
    </div>
  );
}
