"use client";

import { useCallback, useRef } from "react";

/** مفتاح عشوائي لـ Idempotency-Key (يشتغل حتى لو randomUUID مش متاح) */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * مفتاح منع تكرار ثابت لنفس بيانات النموذج:
 *   const idem = useIdempotencyKey();
 *   await payThing(payload, { idempotencyKey: idem.keyFor(payload) });
 *   idem.reset(); // بعد النجاح
 *
 * لو المستخدم ضغط تاني بعد انقطاع الشبكة بنفس البيانات → نفس المفتاح →
 * السيرفر يرجّع نفس النتيجة بدل ما يسجل العملية مرتين.
 * أي تعديل في البيانات = مفتاح جديد (عملية جديدة).
 */
export function useIdempotencyKey() {
  const ref = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((payload: unknown) => {
    const fingerprint = JSON.stringify(payload ?? null);
    if (ref.current?.fingerprint !== fingerprint) {
      ref.current = { fingerprint, key: newIdempotencyKey() };
    }
    return ref.current.key;
  }, []);

  const reset = useCallback(() => {
    ref.current = null;
  }, []);

  return { keyFor, reset };
}

export function idempotencyHeaders(key?: string): Record<string, string> | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}
