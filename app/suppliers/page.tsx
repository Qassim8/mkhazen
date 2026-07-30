import Searchbar from "@/components/layout/Searchbar";

import SuppliersTable from "./components/SuppliersTable";

const Suppliers = () => {
  return (
    <div className="frame p-0! my-8">
      <div className="py-5 px-3">
        <Searchbar />
      </div>
      <SuppliersTable />
    </div>
  );
};

export default Suppliers;
