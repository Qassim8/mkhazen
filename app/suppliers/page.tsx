import TableFilter, { filterOption } from "@/components/shared/TableFilter";
import SuppliersTable from "./components/SuppliersTable";
import TableSearchbar from "@/components/shared/TableSearchbar";
import PageHeader from "@/components/shared/PageHeader";
import { suppliers } from "@/data/data";

const Suppliers = () => {
  const statusOption: filterOption[] = [
    { label: "Active", value: "active" },
    { label: "In Active", value: "inactive" },
  ];

  return (
    <main>
      <PageHeader
        title="Suppliers"
        subtitle={`${suppliers?.length} suppliers has been registerd till now`}
        buttonTitle="Add Supplier"
      />
      <div className="frame p-0! mb-8">
        <div className="py-5 px-3 flex items-center gap-5">
          <TableSearchbar placeholder="Search by name" />
          <div>
            <TableFilter label="Select status:" options={statusOption} />
          </div>
        </div>
        <SuppliersTable />
      </div>
    </main>
  );
};

export default Suppliers;
