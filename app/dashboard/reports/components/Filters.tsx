import { Suspense } from "react";
import TableFilter, { filterOption } from "@/components/shared/TableFilter";
import { categories, suppliers } from "@/data/data";

const Filters = () => {
  const timeOption: filterOption[] = [
    { label: "اسبوع", value: "week" },
    { label: "شهر", value: "month" },
    { label: "6 اشهر", value: "half" },
    { label: "سنة", value: "year" },
  ];

  const categoriesOption: filterOption[] = categories.map(({ title }) => ({
    label: title ?? "غير محدد",
    value: (title ?? "غير محدد").toLowerCase(),
  }));

  const supplierOption: filterOption[] = suppliers.map(({ companyName }) => ({
    label: companyName ?? "غير محدد",
    value: (companyName ?? "غير محدد").toLowerCase(),
  }));
  return (
    <Suspense
      fallback={
        <div className="pb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        </div>
      }
    >
      <div>
        <div className="pb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          <TableFilter label="الفترة:" options={timeOption} />
          <TableFilter label="الصنف" options={categoriesOption} />
          <TableFilter label="المورد" options={supplierOption} />
        </div>
      </div>
    </Suspense>
  );
};

export default Filters;
