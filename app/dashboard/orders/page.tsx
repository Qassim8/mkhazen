import TableFilter, { filterOption } from "@/components/shared/TableFilter";
import OrdersTable from "./components/OrdersTable";
import PageHeader from "@/components/shared/PageHeader";
import { orders } from "@/data/data";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./components/ModalContent";

const Orders = () => {
  const sortFilter: filterOption[] = [
    { label: "Sort: Date", value: "date" },
    { label: "Sort: Quantity", value: "quantity" },
    { label: "Sort: Price", value: "price" },
  ];

  const statusOption: filterOption[] = [
    { label: "Delivered", value: "delivered" },
    { label: "Shipped", value: "shipped" },
    { label: "Processing", value: "processing" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <main>
      <GenericModal modalContent={<ModalContent />} />
      <PageHeader
        title="الطلبيات"
        subtitle={`${orders?.length} has been made`}
        buttonTitle="انشاء طلبية"
      />
      <div className="frame my-8 p-0! ">
        <div className="p-3 md:p-5 flex md:items-center gap-2 md:gap-5">
          <TableFilter label="Select sort type:" options={sortFilter} />
          <TableFilter label="Select status:" options={statusOption} />
        </div>
        <OrdersTable />
      </div>
    </main>
  );
};

export default Orders;
