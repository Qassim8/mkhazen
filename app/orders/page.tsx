import Filters from "../products/components/Filters";
import OrdersTable from "./components/OrdersTable";

const Orders = () => {
  return (
    <div>
      <div className="frame my-8 p-0! ">
        <div className="p-5">
          <Filters />
        </div>
        <OrdersTable />
      </div>
    </div>
  );
};

export default Orders;
