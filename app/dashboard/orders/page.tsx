import OrdersPageClient from "./_components/OrdersPageClient";
import { getPurchaseOrders } from "./services/order.services";
import { PurchaseOrderStatus } from "./schemas/orders.schemas";
import { getProducts } from "../products/services/products.services";
import { getSuppliers } from "../suppliers/service/supplier.services";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: string;
    page?: string;
    limit?: string;
  }>;
}

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const query = await searchParams;
  const status = [
    "DIRECT",
    "DRAFT",
    "APPROVED",
    "RECEIVED",
    "CANCELLED",
  ].includes(query.status || "")
    ? (query.status as PurchaseOrderStatus)
    : undefined;
  const sort = ["date_desc", "date_asc", "total_desc", "total_asc"].includes(
    query.sort || "",
  )
    ? (query.sort as "date_desc" | "date_asc" | "total_desc" | "total_asc")
    : "date_desc";
  const [response, productsResponse, suppliersResponse] = await Promise.all([
    getPurchaseOrders({
      search: query.search,
      status,
      sort,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
    }),
    getProducts({ limit: 100 }),
    getSuppliers({ limit: 100 }),
  ]);

  const products = productsResponse.data || [];
  const suppliers = suppliersResponse.data || [];

  return (
    <OrdersPageClient
      orders={response?.data || []}
      products={products}
      suppliers={suppliers}
      meta={
        response?.meta || {
          totalCount: 0,
          totalPages: 1,
          currentPage: 1,
          limit: 10,
        }
      }
    />
  );
}
