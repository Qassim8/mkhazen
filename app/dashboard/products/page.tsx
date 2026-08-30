import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./_components/Filters";
import PageHeader from "@/components/shared/PageHeader";
import ProductsTable from "./_components/ProductsTable";
import Pagination from "@/components/shared/Pagination"; // تأكد من مسار المكون لديك
import { redirectToNewProductPage } from "./_components/RedirectFunc";
import { getProducts } from "./services/products.services";
import { getCategories } from "../categories/services/categories.services";
import { getSuppliers } from "../suppliers/service/supplier.services";

interface ProductsPageProps {
  searchParams: Promise<{
    search?: string;
    sortBy?: string;
    status?: string;
    page?: string;
    limit?: string;
  }>;
}

const Products = async ({ searchParams }: ProductsPageProps) => {
  const resolvedSearchParams = await searchParams;

  const page = Number(resolvedSearchParams.page) || 1;
  const limit = Number(resolvedSearchParams.limit) || 10;
  const search = resolvedSearchParams.search || "";
  const sortBy = resolvedSearchParams.sortBy || "";
  const status = resolvedSearchParams.status || "";

  const response = await getProducts({
    search,
    page,
    limit,
  });

  const products = response?.data || [];
  const meta = response?.meta || {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const categories = await getCategories();
  const { data: suppliers } = await getSuppliers();

  // useEffect(() => {
  //   let barcodeBuffer = "";
  //   let timeoutId: NodeJS.Timeout;

  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     // قارئ الباركود يكتب بسرعة عالية جداً
  //     if (e.key === "Enter") {
  //       if (barcodeBuffer.trim()) {
  //         console.log("الباركود الممسوح:", barcodeBuffer);
  //         // نفّذ عملية البحث أو الإضافة لسلّة المبيعات هنا
  //         handleSearchByBarcode(barcodeBuffer);
  //         barcodeBuffer = "";
  //       }
  //     } else if (e.key.length === 1) {
  //       // استلام الحروف والأرقام
  //       barcodeBuffer += e.key;
  //       clearTimeout(timeoutId);
  //       timeoutId = setTimeout(() => (barcodeBuffer = ""), 100); // إعادة ضبط إذا أبطأ المستخدم (طباعة يدوية)
  //     }
  //   };

  //   window.addEventListener("keydown", handleKeyDown);
  //   return () => window.removeEventListener("keydown", handleKeyDown);
  // }, []);

  return (
    <main>
      <PageHeader
        title="المنتجات"
        subtitle={`${meta.total} منتج مسجل في النظام`}
        buttonTitle="أضف منتج"
        redirect={redirectToNewProductPage}
      />
      <section className="frame p-0! my-8">
        <Suspense
          fallback={
            <div className="flex h-16 items-center gap-3 px-3 py-5 md:flex-row">
              <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-100" />
            </div>
          }
        >
          <div className="py-5 px-3 flex flex-col md:flex-row md:items-center gap-3">
            <TableSearchbar placeholder="ابحث عبر الاسم او الكود....." />
            <Filters />
          </div>
        </Suspense>

        <ProductsTable
          products={products}
          categories={categories}
          suppliers={suppliers}
        />

        <Suspense
          fallback={<div className="h-16 animate-pulse bg-gray-50" />}
        >
          <Pagination meta={meta} />
        </Suspense>
      </section>
    </main>
  );
};

export default Products;
