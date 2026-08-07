import { LuLock } from "react-icons/lu";

const Password = () => {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuLock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              تحديث كلمة المرور
            </h2>
            <p className="text-sm text-gray-500">
              غيّر كلمة المرور بشكل آمن هنا.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              كلمة المرور الحالية
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="********"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              كلمة المرور الجديدة
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="********"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              تأكيد كلمة المرور
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="********"
            />
          </label>
        </div>

        <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
          تحديث كلمة المرور
        </button>
      </div>
    </div>
  );
};

export default Password;
