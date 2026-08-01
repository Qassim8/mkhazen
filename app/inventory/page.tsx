import AreaChartComponent from "./components/BarChart";
import Filters from "../products/components/Filters";
import Movement from "./components/Movement";
import MovementTable from "./components/MovementsTable";
import PageHeader from "@/components/shared/PageHeader";

const Warehouse = () => {
  return (
    <main>
      <PageHeader
        title="Inventory Movements"
        subtitle="track every stock change across your warehouse"
        buttonTitle="Log Movement"
      />
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
    </main>
  );
};

export default Warehouse;
