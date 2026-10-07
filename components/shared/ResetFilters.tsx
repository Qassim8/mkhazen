"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuRotateCcw } from "react-icons/lu";

export function ResetFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const hasFilters = Array.from(searchParams.keys()).some(
    (key) => key !== "page" && key !== "limit",
  );

  if (!hasFilters) return null;

  const handleReset = () => {
    replace(pathname);
  };

  return (
    <button
      onClick={handleReset}
      className="flex items-center gap-1.5 text-sm text-white bg-slate-800 hover:bg-slate-900 transition-colors px-4 py-2.5 rounded-lg cursor-pointer"
    >
      <LuRotateCcw className="w-3.5 h-3.5" />
      حذف الفلاتر
    </button>
  );
}
