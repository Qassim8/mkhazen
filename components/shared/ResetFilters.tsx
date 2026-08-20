"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuRotateCcw } from "react-icons/lu";

export function ResetFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  // التحقق مما إذا كان هناك أي فلتر مفعّل
  const hasFilters =
    searchParams.has("position") ||
    searchParams.has("shift") ||
    searchParams.has("status") ||
    searchParams.has("search");

  if (!hasFilters) return null;

  const handleReset = () => {
    replace(pathname); // العودة للرابط الأساسي بدون أي Query Params
  };

  return (
    <button
      onClick={handleReset}
      className="flex items-center gap-1.5 text-xs bg-red-600 hover:text-red-800 transition-colors px-4 py-2.5 rounded border border-red-200 text-red-50"
    >
      <LuRotateCcw className="w-3.5 h-3.5" />
      إعادة ضبط
    </button>
  );
}
