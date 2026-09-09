import OrdersPageClient from "./_components/OrdersPageClient";
import { getPurchaseOrders } from "./services/order.services";
import {
  PurchaseOrderStatus,
  PurchaseOrderType,
} from "./schemas/orders.schemas";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    purchaseType?: string;
    sort?: string;
    page?: string;
    limit?: string;
  }>;
}

const validStatuses: PurchaseOrderStatus[] = [
  "DRAFT",
  "APPROVED",
  "RECEIVED",
  "CANCELLED",
];

const validPurchaseTypes: PurchaseOrderType[] = ["DIRECT", "WORKFLOW"];

const validSorts = [
  "date_desc",
  "date_asc",
  "total_desc",
  "total_asc",
] as const;

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const query = await searchParams;

  const status = validStatuses.includes(query.status as PurchaseOrderStatus)
    ? (query.status as PurchaseOrderStatus)
    : undefined;

  const purchaseType = validPurchaseTypes.includes(
    query.purchaseType as PurchaseOrderType,
  )
    ? (query.purchaseType as PurchaseOrderType)
    : undefined;

  const sort = validSorts.includes(query.sort as (typeof validSorts)[number])
    ? (query.sort as (typeof validSorts)[number])
    : "date_desc";

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);

  const response = await getPurchaseOrders({
    search: query.search,
    status,
    purchaseType,
    sort,
    page,
    limit,
  });

  return (
    <OrdersPageClient
      orders={response?.data || []}
      meta={
        response?.meta || {
          total: 0,
          totalPages: 1,
          page: 1,
          limit,
        }
      }
    />
  );
}
