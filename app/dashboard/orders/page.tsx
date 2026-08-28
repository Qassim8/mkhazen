import OrdersPageClient from "./_components/OrdersPageClient";
import { getPurchaseOrders } from "./services/order.services";
import { PurchaseOrderStatus } from "./schemas/orders.schemas";

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
  const status = ["DRAFT", "APPROVED", "RECEIVED", "CANCELLED"].includes(
    query.status || "",
  )
    ? (query.status as PurchaseOrderStatus)
    : undefined;
  const sort = ["date_desc", "date_asc", "total_desc", "total_asc"].includes(
    query.sort || "",
  )
    ? (query.sort as "date_desc" | "date_asc" | "total_desc" | "total_asc")
    : "date_desc";
  const response = await getPurchaseOrders({
    search: query.search,
    status,
    sort,
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
  });

  return (
    <OrdersPageClient
      orders={response?.data || []}
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
