import AreaChartComponent from "./components/BarChart";
import Filters from "../products/components/Filters";
import Movement from "./components/Movement";
import MovementTable from "./components/MovementsTable";

const Warehouse = () => {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
        <div className="col-span-2">
          <AreaChartComponent />
        </div>
        <div className="frame">
          <Movement />
        </div>
      </div>
      <div className="frame my-8 p-0! ">
        <div className="p-5">
          <Filters />
        </div>
        <MovementTable />
      </div>
    </div>
  );
};

export default Warehouse;
