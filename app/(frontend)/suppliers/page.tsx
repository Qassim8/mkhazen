import TableFilter, { filterOption } from "@/components/shared/TableFilter";
import SuppliersTable from "./components/SuppliersTable";
import TableSearchbar from "@/components/shared/TableSearchbar";
import PageHeader from "@/components/shared/PageHeader";
import { suppliers } from "@/data/data";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./components/ModalContent";

const Suppliers = () => {
  const statusOption: filterOption[] = [
    { label: "نشط", value: "active" },
    { label: "غير نشط", value: "inactive" },
  ];

  return (
    <main>
      <GenericModal modalContent={<ModalContent />} />
      <PageHeader
        title="الموردين"
        subtitle={`${suppliers?.length} مورد تم تسجيلهم حتى الان`}
        buttonTitle="اضف مورد"
      />
      <div className="frame p-0! my-8">
        <div className="py-5 px-3 flex items-center gap-5">
          <div className="grow">
            <TableSearchbar placeholder="ابحث بالاسم...." />
          </div>
          <div>
            <TableFilter label="اختر حالة المورد" options={statusOption} />
          </div>
        </div>
        <SuppliersTable />
      </div>
    </main>
  );
};

export default Suppliers;
