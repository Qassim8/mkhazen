import { getCategories } from "../categories/services/categories.services";
import { getProducts } from "../products/services/products.services";
import POSClient from "./_components/POSClient";

export default async function POSPage() {
  const productsResponse = await getProducts({
    page: 1,
    limit: 30,
    sortBy: "createdAt-desc",
  });

  const categoriesResponse = await getCategories();

  return (
    <POSClient
      initialProducts={productsResponse.data}
      categories={categoriesResponse.data}
    />
  );
}
