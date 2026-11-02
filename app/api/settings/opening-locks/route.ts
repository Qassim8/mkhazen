/**
 * /api/settings/opening-locks — قفل المخزون الافتتاحي والأرصدة الافتتاحية (المالك فقط)
 *
 * GET → حالة القفلين ومن غيّرهما ومتى
 * PUT → { key, locked } تغيير أحد القفلين عبر الدالة set_opening_lock (تسجّل من غيّر ومتى)
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiError, dbErrorResponse } from "@/lib/api-response";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { OPENING_LOCK_KEYS, getOpeningLockDetails } from "@/lib/system-locks";

const changeLockSchema = z.object({
  key: z.enum(OPENING_LOCK_KEYS),
  locked: z.boolean(),
});

export async function GET() {
  const guard = await requirePermission("settings.openingLocks");
  if (!guard.ok) return guard.response;

  const details = await getOpeningLockDetails();
  if (!details) {
    return apiError(503, "SERVICE_UNAVAILABLE", "تعذر تحميل حالة القفل، حاول مرة أخرى.");
  }

  return NextResponse.json({ data: details }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const guard = await requirePermission("settings.openingLocks");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const validation = changeLockSchema.safeParse(body);

  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات القفل غير صالحة.");
  }

  const { data, error } = await supabaseAdmin.rpc("set_opening_lock", {
    p_key: validation.data.key,
    p_locked: validation.data.locked,
    p_user_id: guard.session.userId,
  });

  if (error) {
    return dbErrorResponse(error, "set_opening_lock", "تعذر تغيير القفل.");
  }

  // القائمة الجانبية والصفحات تعتمد على القفل
  revalidatePath("/dashboard", "layout");

  const result = data as { key: string; locked: boolean; changed: boolean };
  const details = await getOpeningLockDetails();

  return NextResponse.json({
    message: result.changed
      ? result.locked
        ? "تم تفعيل القفل."
        : "تم فتح القفل."
      : "لا تغيير: القفل بنفس الحالة.",
    data: details ?? [],
  });
}
