import Table from "../../components/layout/Table";
import Filters from "./(components)/Filters";
import Searchbar from "./(components)/Searchbar";

const Products = () => {
  return (
    <div className="frame p-0!">
      <div className="py-5 px-3 flex items-center gap-3">
        <Searchbar />
        <Filters />
      </div>
      <Table />
    </div>
  );
};

export default Products;
