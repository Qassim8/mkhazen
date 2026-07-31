import TableFilter, { filterOption } from "@/components/layout/TableFilter";
import { categories, suppliers } from "@/data/data";
import RevenueChart from "./RevenueChart";

const Filters = () => {
  const timeOption: filterOption[] = [
    { label: "Last Week", value: "week" },
    { label: "Last Month", value: "month" },
    { label: "Last 6 Months", value: "half" },
    { label: "Last Year", value: "year" },
  ];

  const categoriesOption: filterOption[] = categories.map(({ title }) => ({
    label: title,
    value: title.toLowerCase(),
  }));

  const supplierOption: filterOption[] = suppliers.map(({ companyName }) => ({
    label: companyName,
    value: companyName.toLowerCase(),
  }));
  return (
    <div>
      <div className="py-5 flex items-center gap-5">
        <TableFilter label="Select Time:" options={timeOption} />
        <TableFilter label="Select Category:" options={categoriesOption} />
        <TableFilter label="Select Supplier:" options={supplierOption} />
      </div>
    </div>
  );
};

export default Filters;
