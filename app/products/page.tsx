import TableSearchbar from "@/components/layout/TableSearchbar";
import Filters from "./components/Filters";
import ProductsTable from "./components/ProductsTable";

const Products = () => {
  return (
    <div className="frame p-0! my-8">
      <div className="py-5 px-3 flex items-center gap-3">
        <TableSearchbar placeholder="Search by name or SKU" />
        <Filters />
      </div>
      <ProductsTable />
    </div>
  );
};

export default Products;
