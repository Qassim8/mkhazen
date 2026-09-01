"use server";

import { serverFetch } from "@/lib/api-client";
import { InventoryAdjustmentInput } from "../schema/inventory.schemas";

const API_BASE_URL = "/api/inventory";

export interface InventoryMovement {
  id: string;
  movement_type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  quantity: number;
  unit_cost: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
  products?: {
    id: string;
    name: string;
    barcode: string | null;
  } | null;
}

export interface InventoryMovementsResponse {
  movements: InventoryMovement[];
}

export interface ProductMovementsResponse {
  product: {
    id: string;
    name: string;
    barcode: string | null;
    stockQuantity: number;
    minStockLevel: number;
    conversionFactor: number;
  };
  movements: InventoryMovement[];
}

export interface InventoryAdjustmentResponse {
  message: string;
  newStock: number;
}

export interface GetInventoryMovementsParams {
  limit?: number;
  type?: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
}

export async function getInventoryMovements(
  params?: GetInventoryMovementsParams,
): Promise<InventoryMovementsResponse> {
  return serverFetch<InventoryMovementsResponse>(`${API_BASE_URL}/movements`, {
    method: "GET",
    params,
    next: { tags: ["inventory-movements"] },
  });
}

export async function getProductMovements(
  productId: string,
): Promise<ProductMovementsResponse> {
  return serverFetch<ProductMovementsResponse>(
    `${API_BASE_URL}/products/${productId}/movements`,
    {
      method: "GET",
      next: { tags: [`product-movements-${productId}`] },
    },
  );
}

export async function createInventoryAdjustment(
  payload: InventoryAdjustmentInput,
): Promise<InventoryAdjustmentResponse> {
  return serverFetch<InventoryAdjustmentResponse>(
    `${API_BASE_URL}/adjustments`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
