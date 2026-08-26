import CategoriesClient from "./_components/CategoriesPageClients";
import { getCategories } from "./services/categories.services";

export default async function CategoriesPage() {
  const categories = await getCategories();

  return <CategoriesClient initialCategories={categories || []} />;
}
