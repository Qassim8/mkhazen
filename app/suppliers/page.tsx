import Searchbar from "@/components/layout/Searchbar";
import Table from "@/components/layout/Table";
import React from "react";

const Suppliers = () => {
  return (
    <div className="frame p-0! my-8">
      <div className="py-5 px-3">
        <Searchbar />
      </div>
      <Table />
    </div>
  );
};

export default Suppliers;
