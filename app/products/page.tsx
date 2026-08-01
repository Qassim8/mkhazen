import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./components/Filters";
import ProductsTable from "./components/ProductsTable";
import PageHeader from "@/components/shared/PageHeader";
import { categories, products } from "@/data/data";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./components/ModalContent";

const Products = () => {
  return (
    <main>
      <GenericModal modalContent={<ModalContent />} />
      <PageHeader
        title="Products"
        subtitle={`${products?.length} products across ${categories?.length} categories`}
        buttonTitle="Add Product"
      />
      <section className="frame p-0! my-8">
        <div className="py-5 px-3 flex items-center gap-3">
          <TableSearchbar placeholder="Search by name or SKU" />
          <Filters />
        </div>
        <ProductsTable />
      </section>
    </main>
  );
};

export default Products;
