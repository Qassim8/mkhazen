import TableFilter, { filterOption } from "@/components/layout/TableFilter";

const Filters = () => {
  const sortOption: filterOption[] = [
    { label: "Sort: Date", value: "date" },
    { label: "Sort: Quantity", value: "quantity" },
    { label: "Sort: Price", value: "price" },
  ];

  const statusOption: filterOption[] = [
    { label: "In Stock", value: "instock" },
    { label: "Out Of Stock", value: "outstock" },
    { label: "Adjustment", value: "adjustment" },
  ];

  return (
    <div className="flex items-center gap-2">
      <TableFilter label="Select sort type:" options={sortOption} />
      <TableFilter label="Select status:" options={statusOption} />
    </div>
  );
};

export default Filters;
