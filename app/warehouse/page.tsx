import React from "react";
import AreaChartComponent from "./components/BarChart";
import Table from "@/components/layout/Table";
import Filters from "../products/components/Filters";
import Movement from "./components/Movement";

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
        <Table />
      </div>
    </div>
  );
};

export default Warehouse;
