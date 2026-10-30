/**
 * POST /api/customers/merge { keepId, removeId } — دمج عميلين (customers.merge: المالك والمدير)
 * ذرّي داخل merge_customers: تُنقل كل مراجع العميل المدموج إلى العميل المُبقى ثم يُحذف.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invalidJsonResponse, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

const mergeSchema = z.object({
  keepId: z.string().uuid("معرف العميل المُبقى غير صالح"),
  removeId: z.string().uuid("معرف العميل المدموج غير صالح"),
});

export async function POST(request: Request) {
  const guard = await requirePermission("customers.merge", "دمج العملاء متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = mergeSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات الدمج غير صالحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { keepId, removeId } = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request,
    scope: "customers.merge",
    userId: user.userId,
    payload: validation.data,
    context: "merge_customers",
    fallbackMessage: "تعذر دمج العميلين.",
    rpc: () =>
      supabaseAdmin.rpc("merge_customers", {
        p_keep_id: keepId,
        p_remove_id: removeId,
        p_user_id: user.userId,
      }),
    onSuccess: (result) => {
      revalidatePath("/dashboard/customers");

      return {
        status: 200,
        body: {
          message: `تم دمج «${String(result.removed_name ?? "")}» في العميل المُبقى.`,
          keptId: result.kept_id,
          moved: result.moved,
        },
      };
    },
  });
}
