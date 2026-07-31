import TableFilter, { filterOption } from "@/components/layout/TableFilter";
import SuppliersTable from "./components/SuppliersTable";
import TableSearchbar from "@/components/layout/TableSearchbar";

const Suppliers = () => {
  const statusOption: filterOption[] = [
    { label: "Active", value: "active" },
    { label: "In Active", value: "inactive" },
  ];

  return (
    <div className="frame p-0! my-8">
      <div className="py-5 px-3 flex items-center gap-5">
        <TableSearchbar placeholder="Search by name" />
        <div>
          <TableFilter label="Select status:" options={statusOption} />
        </div>
      </div>
      <SuppliersTable />
    </div>
  );
};

export default Suppliers;
