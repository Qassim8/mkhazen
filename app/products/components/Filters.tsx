import TableFilter, { filterOption } from "@/components/layout/TableFilter";
import { categories } from "@/data/data";
import React from "react";
import { LuArrowUpDown } from "react-icons/lu";

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
      <TableFilter options={sortOption} />
      <TableFilter options={statusOption} />
    </div>
  );
};

export default Filters;
