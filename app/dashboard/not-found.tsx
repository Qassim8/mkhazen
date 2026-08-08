import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-gray-300 bg-white p-8 text-center">
      <div className="text-4xl font-semibold text-gray-900">404</div>
      <p className="mt-2 text-sm text-gray-600">
        الصفحة التي تبحث عنها غير موجودة
      </p>
      <Link
        href="/dashboard"
        className="mt-4 rounded-full bg-(--primary-red) px-4 py-2 text-sm font-semibold text-white"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
