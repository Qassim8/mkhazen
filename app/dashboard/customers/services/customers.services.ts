import { serverFetch } from "@/lib/api-client";

export interface CustomerMeasurement {
  label: string;
  value: number;
  unit: "CM" | "M";
}

export interface CustomerRecord {
  id: string;
  name: string;
  whatsappNumber: string;
  measurements: CustomerMeasurement[];
  orderCount: number;
}

export interface CustomersMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RawCustomer {
  id: string;
  name: string;
  whatsapp_number: string;
  measurements: unknown;
  order_count: number;
}

function mapCustomer(raw: RawCustomer): CustomerRecord {
  const measurements = Array.isArray(raw.measurements)
    ? raw.measurements.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as Record<string, unknown>;
        const label = String(row.label ?? "").trim();
        const value = Number(row.value);
        if (!label || !Number.isFinite(value) || value <= 0) return [];
        return [{
          label,
          value,
          unit: row.unit === "M" ? "M" as const : "CM" as const,
        }];
      })
    : [];

  return {
    id: raw.id,
    name: raw.name,
    whatsappNumber: raw.whatsapp_number,
    measurements,
    orderCount: Number(raw.order_count ?? 0),
  };
}

export async function getCustomers(params: {
  search?: string;
  page?: number;
  limit?: number;
  includeOrderCounts?: boolean;
} = {}) {
  const response = await serverFetch<{
    data: RawCustomer[];
    meta: CustomersMeta;
  }>("/api/customers", {
    method: "GET",
    params: {
      search: params.search,
      page: params.page ?? 1,
      limit: params.limit ?? 12,
      includeOrderCounts: params.includeOrderCounts ? "true" : undefined,
    },
  });

  return { data: response.data.map(mapCustomer), meta: response.meta };
}

export async function getCustomerById(id: string) {
  const response = await serverFetch<{ data: RawCustomer }>(
    `/api/customers/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  return mapCustomer(response.data);
}
