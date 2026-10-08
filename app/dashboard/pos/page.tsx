import { getCategories } from "../categories/services/categories.services";
import { getProducts } from "../products/services/products.services";
import POSClient from "./_components/POSClient";

export default async function POSPage() {
  const productsResponse = await getProducts({
    page: 1,
    limit: 18,
    sortBy: "createdAt-desc",
  });

  const categoriesResponse = await getCategories();
  const nextPageResponse =
    productsResponse.meta.totalPages > 1
      ? await getProducts({
          page: 2,
          limit: productsResponse.meta.limit,
          sortBy: "createdAt-desc",
        })
      : null;

  return (
    <POSClient
      initialProducts={productsResponse.data}
      initialPagination={productsResponse.meta}
      initialHasNextPage={(nextPageResponse?.data.length ?? 0) > 0}
      categories={categoriesResponse.data}
    />
  );
}
