import { Suspense } from "react";
import TableFilter, { filterOption } from "@/components/shared/TableFilter";

const Filters = () => {
  const sortOption: filterOption[] = [
    { label: "الأحدث", value: "createdAt-desc" },
    { label: "الأقدم", value: "createdAt-asc" },
    { label: "الكمية: الأقل أولاً", value: "stockQuantity-asc" },
    { label: "السعر: الأعلى أولاً", value: "sellingPrice-desc" },
  ];

  const statusOption: filterOption[] = [
    { label: "متوفر", value: "instock" },
    { label: "منخفض المخزون", value: "lowstock" },
    { label: "نفذت الكمية", value: "outstock" },
  ];

  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 md:items-center">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
      }
    >
      <div className="flex md:items-center gap-2">
        <TableFilter
          label="الترتيب حسب:"
          paramKey="sortBy"
          options={sortOption}
        />
        <TableFilter
          label="حالة المخزون:"
          paramKey="status"
          options={statusOption}
        />
      </div>
    </Suspense>
  );
};

export default Filters;
