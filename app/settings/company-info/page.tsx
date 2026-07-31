import Link from "next/link";
import { LuArrowLeft, LuBuilding2 } from "react-icons/lu";

export default function CompanyInfoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:border-(--primary-red) hover:text-(--primary-red)"
        >
          <LuArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-sm font-medium text-(--primary-red)">Settings</p>
          <h1 className="text-2xl font-semibold text-gray-900">Company Info</h1>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuBuilding2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Company details
            </h2>
            <p className="text-sm text-gray-500">
              Update your business information here.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Company Name
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="Matjrey Store"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Address
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="Cairo, Egypt"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Tax Number
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="EG-874521"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Industry
            </span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              defaultValue="Retail"
            />
          </label>
        </div>

        <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
          Save Company Info
        </button>
      </div>
    </div>
  );
}
