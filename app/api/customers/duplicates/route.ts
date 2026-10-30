/**
 * GET /api/customers/duplicates — مجموعات العملاء بنفس الرقم الموحَّد (customers.merge: المالك والمدير)
 * من find_duplicate_customers، مع عدد فواتير كل عميل لتوضيح ما سيُنقل عند الدمج.
 */

import { NextResponse } from "next/server";

import { dbErrorResponse } from "@/lib/api-response";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

type DuplicateRow = {
  group_key: string;
  customer_id: string;
  name: string;
  whatsapp_number: string;
  notes: string | null;
  created_at: string;
  invoice_count: number | string;
};

export async function GET() {
  const guard = await requirePermission("customers.merge", "كشف العملاء المكررين متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;

  const { data, error } = await supabaseAdmin.rpc("find_duplicate_customers");
  if (error) return dbErrorResponse(error, "find_duplicate_customers", "تعذر جلب العملاء المكررين.");

  const groups = new Map<
    string,
    { phone: string; customers: { id: string; name: string; whatsappNumber: string; notes: string | null; createdAt: string; invoiceCount: number }[] }
  >();

  for (const row of (data ?? []) as DuplicateRow[]) {
    const group = groups.get(row.group_key) ?? { phone: row.group_key, customers: [] };
    group.customers.push({
      id: row.customer_id,
      name: row.name,
      whatsappNumber: row.whatsapp_number,
      notes: row.notes,
      createdAt: row.created_at,
      invoiceCount: Number(row.invoice_count ?? 0),
    });
    groups.set(row.group_key, group);
  }

  return NextResponse.json({ data: [...groups.values()] });
}
