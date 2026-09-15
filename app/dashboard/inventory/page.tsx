import {
  getInventory,
  getInventoryMovements,
} from "./services/inventory.services";

import WarehouseClient from "./_components/WarehouseClient";

interface Props {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    type?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: Props) {
  const query = await searchParams;

  const validTypes = [
    "ALL",
    "PURCHASE",
    "SALE",
    "PURCHASE_RETURN",
    "SALE_RETURN",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
  ] as const;

  const type = validTypes.includes(query.type as (typeof validTypes)[number])
    ? (query.type as (typeof validTypes)[number])
    : "ALL";

  const page = Math.max(Number(query.page) || 1, 1);

  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const [inventoryResponse, movementsResponse] = await Promise.all([
    getInventory({
      page: 1,
      limit: 100,
    }),

    getInventoryMovements({
      page,
      limit,
      type,
    }),
  ]);

  return (
    <WarehouseClient
      movements={movementsResponse?.data || []}
      movementMeta={
        movementsResponse?.meta || {
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
        }
      }
      inventory={inventoryResponse?.data || []}
    />
  );
}
