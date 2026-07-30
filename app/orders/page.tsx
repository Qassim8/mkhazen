import TableFilter, { filterOption } from "@/components/layout/TableFilter";
import OrdersTable from "./components/OrdersTable";

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
    <div>
      <div className="frame my-8 p-0! ">
        <div className="p-5 flex items-center gap-5">
          <TableFilter options={sortFilter} />
          <TableFilter options={statusOption} />
        </div>
        <OrdersTable />
      </div>
    </div>
  );
};

export default Orders;
