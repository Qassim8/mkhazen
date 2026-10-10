import { serverFetch } from "@/lib/api-client";

import type {
  OpeningBalancesInput,
  OpeningBalancesResult,
  OpeningBalancesStatus,
} from "../schemas/opening-balances.schema";

const ENDPOINT = "/api/accounting/opening-balances";

export async function getOpeningBalancesStatus(): Promise<OpeningBalancesStatus> {
  const response = await serverFetch<{ data: OpeningBalancesStatus }>(ENDPOINT, { method: "GET" });
  return response.data;
}

/** معاينة القيود من غير أي حفظ */
export async function previewOpeningBalances(payload: Omit<OpeningBalancesInput, "dryRun">) {
  return serverFetch<{ message: string; data: OpeningBalancesResult }>(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ ...payload, dryRun: true }),
  });
}

/** التسجيل الفعلي — نفس المفتاح لنفس البيانات يمنع التسجيل مرتين */
export async function postOpeningBalances(
  payload: Omit<OpeningBalancesInput, "dryRun">,
  options: { idempotencyKey?: string } = {},
) {
  return serverFetch<{ message: string; data: OpeningBalancesResult }>(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ ...payload, dryRun: false }),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}
