import Filters from "../products/components/Filters";
import Table from "@/components/layout/Table";

const Orders = () => {
  return (
    <div>
      <div className="frame my-8 p-0! ">
        <div className="p-5">
          <Filters />
        </div>
        <Table />
      </div>
    </div>
  );
};

export default Orders;
