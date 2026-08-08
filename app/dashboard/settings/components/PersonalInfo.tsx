import { LuUserRound } from "react-icons/lu";

const PersonalInfo = () => {
  return (
    <div className="space-y-6">
      <div className="">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuUserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              تفاصيل الملف الشخصي
            </h2>
            <p className="text-sm text-gray-500">حدث معلوماتك الشخصية من هنا</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              الاسم الكامل
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="محمد عماد"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              البريد الالكتروني
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="moh.emad@matjrey.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              الهاتف
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="+20 100 123 4567"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              العنوان
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="Cairo, Egypt"
            />
          </label>
        </div>

        <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
          حفظ المعلومات
        </button>
      </div>
    </div>
  );
};

export default PersonalInfo;
