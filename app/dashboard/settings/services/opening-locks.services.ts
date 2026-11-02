import { serverFetch } from "@/lib/api-client";

export type OpeningLockKey = "opening_stock_locked" | "opening_balances_locked";

export interface OpeningLockState {
  key: OpeningLockKey;
  locked: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function getOpeningLocks(): Promise<{ data: OpeningLockState[] }> {
  return serverFetch<{ data: OpeningLockState[] }>("/api/settings/opening-locks", {
    method: "GET",
  });
}

export async function setOpeningLock(
  key: OpeningLockKey,
  locked: boolean,
): Promise<{ message: string; data: OpeningLockState[] }> {
  return serverFetch<{ message: string; data: OpeningLockState[] }>("/api/settings/opening-locks", {
    method: "PUT",
    body: JSON.stringify({ key, locked }),
  });
}
