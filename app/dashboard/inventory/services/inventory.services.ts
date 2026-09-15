"use server";

import { serverFetch } from "@/lib/api-client";

import { InventoryAdjustmentInput } from "../schema/inventory.schemas";

/* =========================================================
   API
========================================================= */

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
  | "ADJUSTMENT_OUT";

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
    } | null;
  } | null;

  purchase_orders?: {
    id: string;

    order_number: string;
  } | null;
  created_by: string | null;

  users?: {
    id: string;
    name: string;
  } | null;
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
    variantId: string;

    previousStock: number;

    quantity: number;

    movementType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

    newStock: number;
  };
}
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
): Promise<InventoryAdjustmentResponse> {
  return serverFetch<InventoryAdjustmentResponse>(
    `${API_BASE_URL}/adjustments`,
    {
      method: "POST",

      body: JSON.stringify(payload),

      next: {
        revalidate: 0,
      },
    },
  );
}
