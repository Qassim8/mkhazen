import { Suspense } from "react";

import TableFilter, { filterOption } from "@/components/shared/TableFilter";

const Filters = () => {
  const sortOptions: filterOption[] = [
    {
      label: "الأحدث",
      value: "createdAt-desc",
    },
    {
      label: "الأقدم",
      value: "createdAt-asc",
    },
    {
      label: "الاسم: أ - ي",
      value: "name-asc",
    },
    {
      label: "الاسم: ي - أ",
      value: "name-desc",
    },
  ];

  const statusOptions: filterOption[] = [
    {
      label: "متوفر",
      value: "instock",
    },
    {
      label: "منخفض المخزون",
      value: "lowstock",
    },
    {
      label: "نفذت الكمية",
      value: "outstock",
    },
  ];

  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
      }
    >
      <div className="flex gap-2">
        <TableFilter
          label="الترتيب حسب"
          paramKey="sortBy"
          options={sortOptions}
        />

        <TableFilter
          label="حالة المخزون"
          paramKey="status"
          options={statusOptions}
        />
      </div>
    </Suspense>
  );
};

export default Filters;
