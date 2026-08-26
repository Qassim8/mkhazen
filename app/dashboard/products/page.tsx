import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./_components/Filters";
import ProductsTable from "./_components/ProductsTable";
import PageHeader from "@/components/shared/PageHeader";
import { categories, products } from "@/data/data";
import { redirectToNewProductPage } from "./_components/RedirectFunc";

const Products = () => {
  return (
    <main>
      <PageHeader
        title="المنتجات"
        subtitle={`${products?.length} منتج من اصل ${categories?.length} صنف`}
        buttonTitle="اضف منتج"
        redirect={redirectToNewProductPage}
      />
      <section className="frame p-0! my-8">
        <div className="py-5 px-3 flex flex-col md:flex-row md:items-center gap-3">
          <TableSearchbar placeholder="ابحث عبر الاسم او الكود....." />
          <Filters />
        </div>
        <ProductsTable />
      </section>
    </main>
  );
};

export default Products;
