/**
 * lib/system-locks.ts — قفل إدخال المخزون الافتتاحي والأرصدة الافتتاحية
 *
 * القيم محفوظة في public.system_settings (opening_stock_locked / opening_balances_locked).
 * الفحص الحقيقي داخل دوال قاعدة البيانات؛ هذا الملف لإخفاء الروابط وعرض الصفحات للقراءة فقط
 * ولرفض الطلب مبكرًا في الـ API. لو تعذرت القراءة نعتبر القفل غير مفعّل هنا وتتولى الدالة الرفض.
 */

import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

export const OPENING_LOCK_KEYS = ["opening_stock_locked", "opening_balances_locked"] as const;
export type OpeningLockKey = (typeof OPENING_LOCK_KEYS)[number];

export const OPENING_STOCK_LOCKED_MESSAGE = "المخزون الافتتاحي مقفل. استخدم أوامر الشراء لإضافة بضاعة";
export const OPENING_BALANCES_LOCKED_MESSAGE =
  "الأرصدة الافتتاحية مقفلة. افتح القفل من الإعدادات (للمالك فقط) إن احتجت لتسجيل أرصدة جديدة";

export interface OpeningLocks {
  openingStockLocked: boolean;
  openingBalancesLocked: boolean;
}

export interface OpeningLockDetail {
  key: OpeningLockKey;
  locked: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function getOpeningLocks(): Promise<OpeningLocks> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, bool_value")
    .in("key", [...OPENING_LOCK_KEYS]);

  if (error) {
    console.error("system_settings:", error);
    return { openingStockLocked: false, openingBalancesLocked: false };
  }

  const rows = (data ?? []) as { key: string; bool_value: boolean }[];
  const read = (key: OpeningLockKey) => rows.find((row) => row.key === key)?.bool_value === true;

  return {
    openingStockLocked: read("opening_stock_locked"),
    openingBalancesLocked: read("opening_balances_locked"),
  };
}

/** القفل مع من غيّره ومتى (لشاشة الإعدادات) */
export async function getOpeningLockDetails(): Promise<OpeningLockDetail[] | null> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, bool_value, updated_at, users:updated_by ( name )")
    .in("key", [...OPENING_LOCK_KEYS]);

  if (error) {
    console.error("system_settings (details):", error);
    return null;
  }

  const rows = (data ?? []) as unknown as {
    key: string;
    bool_value: boolean;
    updated_at: string | null;
    users: { name: string | null } | { name: string | null }[] | null;
  }[];

  return OPENING_LOCK_KEYS.map((key) => {
    const row = rows.find((item) => item.key === key);
    const user = Array.isArray(row?.users) ? row?.users[0] : row?.users;

    return {
      key,
      locked: row?.bool_value === true,
      updatedAt: row?.updated_at ?? null,
      updatedByName: user?.name ?? null,
    };
  });
}
