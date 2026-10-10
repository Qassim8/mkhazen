/**
 * =====================================================================
 * lib/idempotency.ts — منع تكرار العمليات المالية عند إعادة الإرسال
 * =====================================================================
 * الواجهة بتبعت هيدر Idempotency-Key ثابت لنفس العملية (نفس السلة مثلًا).
 * • أول مرة: بنحجز المفتاح (PENDING) وننفذ العملية ونخزن الرد (COMPLETED).
 * • إعادة إرسال بنفس المفتاح ونفس البيانات: بيرجع نفس الرد من غير تنفيذ تاني.
 * • نفس المفتاح ببيانات مختلفة: بيترفض (422).
 * • المفتاح لسه PENDING (العملية الأولى شغالة أو انقطعت في النص): بيترفض (409)
 *   — عشان ما نعملش بيع مرتين لو مش متأكدين النتيجة الأولى إيه.
 *
 * لو جدول api_idempotency_keys مش موجود (الـ migration ما اتطبقتش لسه)
 * العملية بتتنفذ عادي من غير الحماية دي (مع تحذير في اللوج) عشان الكاشير
 * ما يقفش — الدالة نفسها ذرّية في قاعدة البيانات.
 */
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { apiError, dbErrorResponse, isDefiniteDbRejection } from "@/lib/api-response";

const TABLE = "api_idempotency_keys";
const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;

let warnedMissingTable = false;

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /api_idempotency_keys/.test(message) && /does not exist|schema cache/i.test(message);
}

import { requestHash } from "@/lib/idempotency-hash";

export { canonicalJson, requestHash } from "@/lib/idempotency-hash";

export type IdempotencyResult =
  | { kind: "response"; response: NextResponse }
  | { kind: "proceed"; finish: (status: number, body: Record<string, unknown>) => Promise<void>; abandon: () => Promise<void> };

const NOOP_PROCEED: IdempotencyResult = {
  kind: "proceed",
  finish: async () => undefined,
  abandon: async () => undefined,
};

/**
 * @param scope   نوع العملية (مثلًا "sales.checkout")
 * @param userId  صاحب الطلب — المفتاح ما يتشاركش بين مستخدمين
 * @param clientKey قيمة هيدر Idempotency-Key (اختياري: من غيره مفيش حماية)
 * @param payload البيانات بعد الـ validation (للمقارنة عند إعادة الإرسال)
 */
export async function beginIdempotentOperation(params: {
  scope: string;
  userId: string;
  clientKey: string | null;
  payload: unknown;
}): Promise<IdempotencyResult> {
  const { scope, userId, clientKey, payload } = params;

  if (!clientKey) return NOOP_PROCEED;

  if (!KEY_RE.test(clientKey)) {
    return {
      kind: "response",
      response: apiError(400, "VALIDATION_ERROR", "مفتاح منع التكرار (Idempotency-Key) غير صالح."),
    };
  }

  const key = `${scope}:${userId}:${clientKey}`;
  const hash = requestHash(payload);

  const { error: insertError } = await supabaseAdmin.from(TABLE).insert({
    key,
    scope,
    user_id: userId,
    request_hash: hash,
    status: "PENDING",
  });

  if (!insertError) {
    // تنظيف عرضي للمفاتيح القديمة (أكتر من 30 يوم)
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      void supabaseAdmin.from(TABLE).delete().lt("created_at", cutoff).then(() => undefined);
    }

    return {
      kind: "proceed",
      finish: async (status, body) => {
        const { error } = await supabaseAdmin
          .from(TABLE)
          .update({
            status: "COMPLETED",
            response_status: status,
            response_body: body,
            completed_at: new Date().toISOString(),
          })
          .eq("key", key);
        if (error) console.error(`[idempotency] failed to store response for ${scope}:`, error.message);
      },
      // العملية فشلت فشل مؤكد (قاعدة البيانات رجعت خطأ → المعاملة اترجعت):
      // نحرر المفتاح عشان إعادة المحاولة بنفس البيانات تتنفذ
      abandon: async () => {
        const { error } = await supabaseAdmin.from(TABLE).delete().eq("key", key).eq("status", "PENDING");
        if (error) console.error(`[idempotency] failed to release key for ${scope}:`, error.message);
      },
    };
  }

  if (isMissingTable(insertError)) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn("[idempotency] api_idempotency_keys table is missing — apply migration 20261009_01. Proceeding without duplicate protection.");
    }
    return NOOP_PROCEED;
  }

  if (insertError.code !== "23505") {
    console.error(`[idempotency] cannot reserve key for ${scope}:`, insertError.message);
    return {
      kind: "response",
      response: apiError(503, "SERVICE_UNAVAILABLE", "تعذر بدء العملية الآن. حاول مرة أخرى بعد قليل."),
    };
  }

  // المفتاح مستخدم قبل كده
  const { data: existing, error: readError } = await supabaseAdmin
    .from(TABLE)
    .select("request_hash, status, response_status, response_body")
    .eq("key", key)
    .maybeSingle();

  if (readError || !existing) {
    return {
      kind: "response",
      response: apiError(503, "SERVICE_UNAVAILABLE", "تعذر التحقق من حالة العملية السابقة. حاول مرة أخرى."),
    };
  }

  if (existing.request_hash !== hash) {
    return {
      kind: "response",
      response: apiError(
        422,
        "IDEMPOTENCY_KEY_REUSED",
        "تم استخدام نفس معرف العملية لبيانات مختلفة. أعد تحميل الصفحة وحاول مرة أخرى.",
      ),
    };
  }

  if (existing.status === "COMPLETED" && existing.response_body) {
    return {
      kind: "response",
      response: NextResponse.json(
        { ...(existing.response_body as Record<string, unknown>), replayed: true },
        { status: existing.response_status ?? 200, headers: { "Idempotent-Replayed": "true" } },
      ),
    };
  }

  return {
    kind: "response",
    response: apiError(
      409,
      "IDEMPOTENCY_IN_PROGRESS",
      "هذه العملية أُرسلت من قبل وما زالت قيد المعالجة أو انقطع الاتصال أثناءها. راجع سجل العمليات قبل إعادة المحاولة.",
    ),
  };
}

export function readIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value ? value.trim() : null;
}

/**
 * النمط المتكرر: (تحقق → دالة قاعدة بيانات ذرّية → رد) مع منع التكرار.
 * • قاعدة البيانات رفضت (كود SQLSTATE) → المعاملة اترجعت → المفتاح بيتحرر.
 * • نتيجة غير معروفة (شبكة) → المفتاح بيفضل محجوز → إعادة الإرسال بتترفض بدل تكرار العملية.
 */
export async function runIdempotentRpc<TData>(params: {
  request: Request;
  scope: string;
  userId: string;
  payload: unknown;
  context: string;
  fallbackMessage: string;
  rpc: () => PromiseLike<{ data: TData | null; error: { code?: string; message?: string } | null }>;
  onSuccess: (data: TData) => Promise<{ status?: number; body: Record<string, unknown> }> | { status?: number; body: Record<string, unknown> };
}): Promise<NextResponse> {
  const idempotency = await beginIdempotentOperation({
    scope: params.scope,
    userId: params.userId,
    clientKey: readIdempotencyKey(params.request),
    payload: params.payload,
  });
  if (idempotency.kind === "response") return idempotency.response;

  let result: { data: TData | null; error: { code?: string; message?: string } | null };
  try {
    result = await params.rpc();
  } catch (error) {
    console.error(`[${params.context}] unknown outcome:`, error);
    return apiError(
      503,
      "SERVICE_UNAVAILABLE",
      "تعذر التأكد من إتمام العملية بسبب مشكلة في الاتصال. راجع السجل قبل إعادة المحاولة.",
    );
  }

  if (result.error) {
    if (isDefiniteDbRejection(result.error)) {
      await idempotency.abandon();
    }
    return dbErrorResponse(result.error, params.context, params.fallbackMessage);
  }

  const { status = 200, body } = await params.onSuccess(result.data as TData);
  await idempotency.finish(status, body);
  return NextResponse.json(body, { status });
}
