import TableFilter, { filterOption } from "@/components/shared/TableFilter";

const Filters = () => {
  const sortOption: filterOption[] = [
    { label: "التاريخ", value: "date" },
    { label: "الكمية", value: "quantity" },
    { label: "السعر", value: "price" },
  ];

  const statusOption: filterOption[] = [
    { label: "متوفر", value: "instock" },
    { label: "نفذ", value: "outstock" },
    { label: "Adjustment", value: "adjustment" },
  ];

  return (
    <div className="flex md:items-center gap-2">
      <TableFilter label="الترتيب حسب:" options={sortOption} />
      <TableFilter label="اختر حالة للمنتج:" options={statusOption} />
    </div>
  );
};

export default Filters;
