"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

interface MetaProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaginationProps {
  meta?: MetaProps;
}

const Pagination = ({ meta }: PaginationProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!meta || meta.total === 0 || meta.totalPages <= 1) {
    return null;
  }

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams.toString());

    params.set("page", String(pageNumber));

    return `${pathname}?${params.toString()}`;
  };

  const handlePageChange = (pageNumber: number) => {
    if (
      pageNumber < 1 ||
      pageNumber > meta.totalPages ||
      pageNumber === meta.page
    ) {
      return;
    }

    router.push(createPageUrl(pageNumber));
  };

  const getVisiblePages = () => {
    const totalPages = meta.totalPages;
    const currentPage = meta.page;

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, "ellipsis-right", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [
        1,
        "ellipsis-left",
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [
      1,
      "ellipsis-left",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "ellipsis-right",
      totalPages,
    ];
  };

  const visiblePages = getVisiblePages();

  const start = (meta.page - 1) * meta.limit + 1;

  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col gap-4 border-t border-gray-100 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between">
      <div className="text-center text-gray-500 md:text-start">
        عرض <span className="font-semibold text-gray-800">{start}</span> إلى{" "}
        <span className="font-semibold text-gray-800">{end}</span> من أصل{" "}
        <span className="font-semibold text-gray-800">{meta.total}</span> منتج
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          aria-label="الصفحة السابقة"
          disabled={meta.page <= 1}
          onClick={() => handlePageChange(meta.page - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LuChevronRight className="h-5 w-5" />
        </button>

        {visiblePages.map((page) => {
          if (typeof page !== "number") {
            return (
              <span
                key={page}
                className="flex h-9 w-8 items-center justify-center text-gray-400"
              >
                …
              </span>
            );
          }

          const isCurrent = page === meta.page;

          return (
            <button
              key={page}
              type="button"
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => handlePageChange(page)}
              className={`flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 text-sm font-semibold transition ${
                isCurrent
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {page}
            </button>
          );
        })}

        <button
          type="button"
          aria-label="الصفحة التالية"
          disabled={meta.page >= meta.totalPages}
          onClick={() => handlePageChange(meta.page + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LuChevronLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
