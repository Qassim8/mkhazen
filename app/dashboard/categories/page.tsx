import CategoriesClient from "./_components/CategoriesPageClients";
import { getCategories } from "./services/categories.services";

export default async function CategoriesPage() {
  const { data: categories } = await getCategories();

  console.log(categories);

  return <CategoriesClient initialCategories={categories} />;
}
