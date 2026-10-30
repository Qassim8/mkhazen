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
  notes: string | null;
  /** إحصاءات (عند includeStats فقط) */
  invoiceCount: number;
  totalPurchases: number;
  lastActivity: string | null;
  /** المتبقي على طلبات التفصيل (قيد التنفيذ + المستحق) */
  tailoringRemaining: number;
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
  notes?: string | null;
  invoice_count?: number;
  total_purchases?: number;
  last_activity?: string | null;
  tailoring_in_progress_remaining?: number;
  tailoring_due_remaining?: number;
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
    notes: raw.notes ?? null,
    invoiceCount: Number(raw.invoice_count ?? raw.order_count ?? 0),
    totalPurchases: Number(raw.total_purchases ?? 0),
    lastActivity: raw.last_activity ?? null,
    tailoringRemaining:
      Number(raw.tailoring_in_progress_remaining ?? 0) + Number(raw.tailoring_due_remaining ?? 0),
  };
}

export async function getCustomers(params: {
  search?: string;
  page?: number;
  limit?: number;
  includeOrderCounts?: boolean;
  includeStats?: boolean;
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
      includeStats: params.includeStats || params.includeOrderCounts ? "true" : undefined,
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

/* =========================================================
   تفاصيل العميل
========================================================= */

export interface CustomerOrderRow {
  id: string;
  orderNumber: string;
  kind: "POS" | "TAILORING";
  createdAt: string;
  completedAt: string | null;
  itemName: string | null;
  total: number;
  paid: number;
  remaining: number;
  statusLabel: string;
  inProgress: boolean;
  isCredit: boolean;
}

export interface CustomerDetail {
  id: string;
  name: string;
  whatsappNumber: string;
  notes: string | null;
  createdAt: string;
  stats: {
    invoiceCount: number;
    totalPurchases: number;
    totalPaid: number;
    lastActivity: string | null;
    tailoringInProgressRemaining: number;
    tailoringDueRemaining: number;
  };
  orders: CustomerOrderRow[];
  payments: {
    id: string;
    orderId: string;
    orderNumber: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    notes: string | null;
  }[];
  duplicates: DuplicateHit[];
}

export interface DuplicateHit {
  id: string;
  name: string;
  whatsapp_number: string;
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail> {
  const response = await serverFetch<{
    data: {
      id: string;
      name: string;
      whatsapp_number: string;
      notes: string | null;
      created_at: string;
      stats: CustomerDetail["stats"];
      orders: CustomerOrderRow[];
      payments: CustomerDetail["payments"];
      duplicates: DuplicateHit[];
    };
  }>(`/api/customers/${encodeURIComponent(id)}`, {
    method: "GET",
    params: { detail: "true" },
    cache: "no-store",
  });

  const data = response.data;
  return {
    id: data.id,
    name: data.name,
    whatsappNumber: data.whatsapp_number,
    notes: data.notes,
    createdAt: data.created_at,
    stats: data.stats,
    orders: data.orders,
    payments: data.payments,
    duplicates: data.duplicates,
  };
}

/* =========================================================
   إنشاء / تعديل / حذف / دمج
========================================================= */

export interface CustomerInputPayload {
  name: string;
  whatsappNumber: string;
  notes?: string | null;
}

export async function createCustomer(payload: CustomerInputPayload) {
  const response = await serverFetch<{
    message: string;
    data: RawCustomer;
    duplicates: DuplicateHit[];
  }>("/api/customers", { method: "POST", body: JSON.stringify(payload) });

  return { customer: mapCustomer(response.data), duplicates: response.duplicates ?? [], message: response.message };
}

export async function updateCustomer(id: string, payload: CustomerInputPayload) {
  const response = await serverFetch<{ message: string; duplicates: DuplicateHit[] }>(
    `/api/customers/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );

  return { duplicates: response.duplicates ?? [], message: response.message };
}

export async function deleteCustomer(id: string) {
  return serverFetch<{ message: string }>(`/api/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** عملاء آخرون بنفس الرقم الموحَّد (للتنبيه أثناء الكتابة) */
export async function checkPhoneDuplicates(phone: string, excludeId?: string): Promise<DuplicateHit[]> {
  const response = await serverFetch<{ data: DuplicateHit[] }>("/api/customers", {
    method: "GET",
    params: { phone, excludeId },
  });
  return response.data;
}

export interface DuplicateGroup {
  phone: string;
  customers: {
    id: string;
    name: string;
    whatsappNumber: string;
    notes: string | null;
    createdAt: string;
    invoiceCount: number;
  }[];
}

export async function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  const response = await serverFetch<{ data: DuplicateGroup[] }>("/api/customers/duplicates", {
    method: "GET",
    cache: "no-store",
  });
  return response.data;
}

export async function mergeCustomers(keepId: string, removeId: string, options: { idempotencyKey?: string } = {}) {
  return serverFetch<{ message: string; moved: Record<string, number> }>("/api/customers/merge", {
    method: "POST",
    body: JSON.stringify({ keepId, removeId }),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}
