import TableFilter, { filterOption } from "@/components/layout/TableFilter";
import { categories, suppliers } from "@/data/data";

const Filters = () => {
  const departOption: filterOption[] = [
    { label: "Sales", value: "sales" },
    { label: "Warehouse", value: "warehouse" },
    { label: "Management", value: "management" },
  ];

  const shiftOption: filterOption[] = [
    { label: "Morning", value: "morning" },
    { label: "Night", value: "night" },
    { label: "Flexible", value: "flexible" },
  ];

  const statusOption: filterOption[] = [
    { label: "Active", value: "active" },
    { label: "In Active", value: "inactive" },
  ];

  return (
    <div>
      <div className="py-5 flex items-center gap-5">
        <TableFilter label="Select Time:" options={departOption} />
        <TableFilter label="Select Category:" options={shiftOption} />
        <TableFilter label="Select Supplier:" options={statusOption} />
      </div>
    </div>
  );
};

export default Filters;
