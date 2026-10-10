// app/api/auth/me/route.ts
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { requireLogin } from "@/lib/permissions-server";
import { apiError } from "@/lib/api-response";

export { PUT } from "./update/route";

export async function GET() {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, phone, role, shift, isPasswordChanged")
    .eq("id", guard.session.userId)
    .maybeSingle();

  if (error) {
    console.error("GET /api/auth/me:", error);
    return apiError(503, "SERVICE_UNAVAILABLE", "تعذر تحميل بيانات الحساب، حاول مرة أخرى.");
  }

  if (!user) {
    return apiError(404, "NOT_FOUND", "المستخدم غير موجود");
  }

  return NextResponse.json(user, {
    headers: {
      "Cache-Control": "no-store, max-age=0", // لمنع المتصفح من كاش الكول في الـ Client
    },
  });
}
