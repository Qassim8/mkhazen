// (كان "use server": الدوال كانت Server Actions عامة ورسائل أخطائها بتختفي في الإنتاج)
import { serverFetch } from "@/lib/api-client";

import { InventoryAdjustmentInput } from "../schema/inventory.schemas";

/* =========================================================
   API
========================================================= */

import type {
  OpeningStockCandidate,
  OpeningStockInput,
  OpeningStockResult,
} from "../schema/inventory.schemas";

const API_BASE_URL = "/api/inventory";

/* =========================================================
   TYPES
========================================================= */

export type InventoryMovementType =
  | "PURCHASE"
  | "SALE"
  | "PURCHASE_RETURN"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "PRODUCTION_ISSUE"
  | "PRODUCTION_RECEIPT"
  | "GIFT"
  | "OPENING_STOCK";

export type InventoryStatus = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface InventoryProduct {
  id: string;
  name: string;
}

export interface InventoryMovement {
  id: string;

  movement_type: InventoryMovementType;

  quantity: number;

  unit_cost: number;

  reference: string | null;

  notes: string | null;

  created_at: string;

  template_id: string;

  variant_id: string;

  purchase_order_id: string | null;

  sales_order_id?: string | null;

  product_variants?: {
    id: string;

    sku: string | null;

    barcode: string | null;

    colorName: string | null;

    size: string | null;

    product_templates?: {
      id: string;

      name: string;

      sellingUnit: string | null;

      purchaseUnit: string | null;

      conversionFactor?: number | null;
    } | null;
  } | null;

  purchase_orders?: {
    id: string;

    order_number: string;
  } | null;

  users?: {
    id: string;

    name: string;
  } | null;

  created_by: string | null;
}

export interface InventoryVariant {
  id: string;

  templateId: string;

  sku: string | null;

  barcode: string | null;

  packBarcode: string | null;

  colorName: string | null;

  colorCode: string | null;

  size: string | null;

  purchasePrice: number;

  sellingPrice: number;

  minSellingPrice: number | null;

  stockQuantity: number;

  minStockLevel: number;

  isActive: boolean;

  product_templates: {
    id: string;

    name: string;

    purchaseUnit: string | null;

    sellingUnit: string | null;

    conversionFactor: number | null;

    isActive: boolean;
  } | null;
}

/* =========================================================
   LIST RESPONSE
========================================================= */

export interface InventoryListResponse {
  data: InventoryVariant[];

  meta: {
    total: number;

    page: number;

    limit: number;

    totalPages: number;
  };
}

/* =========================================================
   DETAIL RESPONSE
========================================================= */

export interface InventoryVariantResponse {
  variant: InventoryVariant;

  movements: InventoryMovement[];
}

/* =========================================================
   ADJUSTMENT RESPONSE
========================================================= */

export interface InventoryAdjustmentResponse {
  message: string;

  data: {
    variant_id: string;

    previous_stock: number;

    new_stock: number;

    quantity: number;

    amount: number;

    payment_method: "CASH" | "BANK" | null;

    movement_type: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

    unit_cost: number;

    total_cost: number;

    movement_id: string;

    journal_entry_id: string | null;

    secondary_journal_entry_id: string | null;
  };
}

/* =========================================================
   MOVEMENTS RESPONSE
========================================================= */

export interface InventoryMovementsResponse {
  data: InventoryMovement[];

  meta: {
    total: number;

    page: number;

    limit: number;

    totalPages: number;
  };
}

/* =========================================================
   QUERY PARAMS
========================================================= */

export interface GetInventoryParams {
  page?: number;

  limit?: number;

  search?: string;

  status?: InventoryStatus;
}

export interface GetInventoryMovementsParams {
  page?: number;

  limit?: number;

  type?: InventoryMovementType | "ALL";
}

/* =========================================================
   GET INVENTORY
========================================================= */

export async function getInventory(
  params?: GetInventoryParams,
): Promise<InventoryListResponse> {
  return serverFetch<InventoryListResponse>(`${API_BASE_URL}`, {
    method: "GET",

    params: {
      page: params?.page ?? 1,

      limit: params?.limit ?? 50,

      search: params?.search || undefined,

      status:
        params?.status && params.status !== "ALL" ? params.status : undefined,
    },

    next: {
      tags: ["inventory-list"],
    },
  });
}

/* =========================================================
   GET VARIANT + MOVEMENTS
========================================================= */

/**
 * كل أصناف المخزون (لكروت الإحصائيات وقائمة اختيار التسوية).
 * أول 100 بس كانت بتطلّع إحصائيات غلط وأصناف ناقصة في التسوية.
 */
export async function getAllInventory(): Promise<InventoryListResponse> {
  const first = await getInventory({ page: 1, limit: 100 });
  const data = [...first.data];

  for (let page = 2; page <= (first.meta?.totalPages ?? 1); page++) {
    const next = await getInventory({ page, limit: 100 });
    data.push(...next.data);
  }

  return { ...first, data, meta: { ...first.meta, page: 1, limit: data.length, totalPages: 1 } };
}

export async function getInventoryVariant(
  variantId: string,
): Promise<InventoryVariantResponse> {
  if (!variantId) {
    throw new Error("معرف المتغير مطلوب");
  }

  return serverFetch<InventoryVariantResponse>(
    `${API_BASE_URL}/products/${variantId}/movements`,
    {
      method: "GET",

      next: {
        tags: ["inventory-list", `inventory-variant-${variantId}`],
      },
    },
  );
}

/* =========================================================
   GET MOVEMENTS
========================================================= */

export async function getInventoryMovements(
  params?: GetInventoryMovementsParams,
): Promise<InventoryMovementsResponse> {
  return serverFetch<InventoryMovementsResponse>(`${API_BASE_URL}/movements`, {
    method: "GET",

    params: {
      page: params?.page ?? 1,

      limit: params?.limit ?? 20,

      type: params?.type ?? "ALL",
    },

    next: {
      tags: ["inventory-movements"],
    },
  });
}

/* =========================================================
   CREATE MANUAL ADJUSTMENT
========================================================= */

export async function createInventoryAdjustment(
  payload: InventoryAdjustmentInput,
  options: { idempotencyKey?: string } = {},
): Promise<InventoryAdjustmentResponse> {
  return serverFetch<InventoryAdjustmentResponse>(
    `${API_BASE_URL}/adjustments`,
    {
      method: "POST",

      body: JSON.stringify(payload),

      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    },
  );
}

/* =========================================================
   OPENING STOCK — المخزون الافتتاحي
========================================================= */

export async function getOpeningStockCandidates(): Promise<{
  data: OpeningStockCandidate[];
}> {
  return serverFetch<{ data: OpeningStockCandidate[] }>(
    `${API_BASE_URL}/opening-stock`,
    { method: "GET" },
  );
}

export async function recordOpeningStock(payload: OpeningStockInput): Promise<{
  message: string;
  data: OpeningStockResult;
}> {
  return serverFetch<{ message: string; data: OpeningStockResult }>(
    `${API_BASE_URL}/opening-stock`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
