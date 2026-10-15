import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/permissions-server";
import { apiError } from "@/lib/api-response";
import { generateProductCodes } from "@/app/api/tailoring/_lib/product-codes";

/** GET — SKU وباركود جديدين لمنتج ناتج من التصنيع أو تحويل طلب تفصيل */
export async function GET() {
  const guard = await requirePermission("tailoring.manage");
  if (!guard.ok) return guard.response;

  try {
    const codes = await generateProductCodes();
    return NextResponse.json({ data: codes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/tailoring/product-codes:", error);
    return apiError(500, "INTERNAL_ERROR", "تعذر توليد SKU والباركود.");
  }
}
