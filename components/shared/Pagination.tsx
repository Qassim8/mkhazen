"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuChevronRight, LuChevronLeft } from "react-icons/lu";

interface MetaProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function Pagination({ meta }: { meta?: MetaProps }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!meta || meta.totalPages <= 1) return null;

  const createPageURL = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= meta.totalPages) {
      router.push(createPageURL(newPage));
    }
  };

  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-sm">
      <div className="text-gray-500">
        عرض{" "}
        <span className="font-semibold text-gray-800">
          {(meta.page - 1) * meta.limit + 1}
        </span>{" "}
        إلى{" "}
        <span className="font-semibold text-gray-800">
          {Math.min(meta.page * meta.limit, meta.total)}
        </span>{" "}
        من أصل <span className="font-semibold text-gray-800">{meta.total}</span>{" "}
        عنصر
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handlePageChange(meta.page - 1)}
          disabled={meta.page <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <LuChevronRight className="h-5 w-5" />
        </button>

        <span className="px-3 font-semibold text-gray-700">
          {meta.page} / {meta.totalPages}
        </span>

        <button
          type="button"
          onClick={() => handlePageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <LuChevronLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
