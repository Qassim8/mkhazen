/**
 * /api/notifications — إشعارات الإدارة وتحديثات التفصيل للكاشير والخياط
 *
 * مين يشوف إيه:
 * • target_roles فاضي → إشعارات الإدارة (المالك والمدير): مخزون، تأخير، كلمات السر…
 * • تحديثات التفصيل موجّهة للمالك والمدير والكاشير والخياط المعيّن فقط.
 * • target_roles فيه أدوار → للإدارة إذا كانت ضمن الأدوار المستهدفة
 * • اللي عمل الإجراء ما يشوفش إشعاره بنفسه (metadata.actor_id)
 *
 * GET    ?limit=20&offset=0&filter=all|unread   → صفحة إشعارات + عدد غير المقروء
 * PATCH  { id } | { markAll: true }             → تعليم كمقروء
 * DELETE ?id=...  | ?scope=read | ?scope=all     → حذف
 *
 * مع كل GET (مرة كل 5 دقائق كحد أقصى) بيتنفذ maintain_notifications:
 * إنشاء إشعارات طلبات التفصيل المتأخرة + مسح المقروء الأقدم من 30 يوم.
 * إشعارات المخزون بتتعمل تلقائيًا من قاعدة البيانات (trigger) لحظة تغيّر الرصيد.
 */

import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { can, isManager, normalizeRole } from "@/lib/permissions";
import { ensureTailorAssignmentNotifications } from "@/app/api/tailoring/_lib/notify";

export const dynamic = "force-dynamic";

const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
let lastMaintenanceAt = 0;

/**
 * يرجّع دور المستخدم لو مسموحله يشوف الإشعارات.
 * كل إشعار ممكن يكون موجّه لأدوار معينة (target_roles)،
 * ولو target_roles فاضي يبقى للإدارة كلها (المالك والمدير).
 */
async function requireViewer() {
  const session = await getSession();
  if (!session || !can(session.role, "notifications.view")) return null;
  const role = normalizeRole(session.role);
  return role ? { role, userId: session.userId } : null;
}

/** كل دور يرى الإشعارات المخوّلة له؛ الخياط مقيّد بالطلبات المسندة لحسابه. */
function audience(role: string) {
  if (isManager(role)) return `target_roles.is.null,target_roles.cs.{${role}}`;
  if (role === "cashier") {
    return `and(type.eq.TAILORING_UPDATE,target_roles.is.null),target_roles.cs.{cashier}`;
  }
  return `target_roles.cs.{${role}}`;
}

/** الإجراء اللي المستخدم عمله بنفسه ما يظهرلوش كإشعار */
function ownActionFilter(userId: string) {
  return JSON.stringify({ actor_id: userId });
}

function getStockNotificationVariantId(
  metadata: unknown,
  link: string | null,
): string | null {
  if (metadata && typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    const variantId = record.variant_id ?? record.variantId;
    if (typeof variantId === "string" && variantId.trim()) {
      return variantId.trim();
    }
  }

  if (link) {
    const queryString = link.split("?")[1]?.split("#")[0] ?? "";
    const variantId = new URLSearchParams(queryString).get("variantId");
    if (variantId) return variantId;
  }

  return null;
}

function getNotificationLink(
  type: string,
  link: string | null,
  metadata: unknown,
): string | null {
  if (type !== "LOW_STOCK" && type !== "OUT_OF_STOCK") return link;

  const variantId = getStockNotificationVariantId(metadata, link);
  return variantId
    ? `/dashboard/orders/new?variantId=${encodeURIComponent(variantId)}`
    : link;
}

async function runMaintenanceIfDue() {
  if (!MAIN_BRANCH_ID || Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) {
    return;
  }

  lastMaintenanceAt = Date.now();

  const { error } = await supabaseAdmin.rpc("maintain_notifications", {
    p_branch_id: MAIN_BRANCH_ID,
  });

  if (error) {
    // ما نوقفش عرض الإشعارات بسبب فشل الصيانة
    console.error("maintain_notifications:", error);
    lastMaintenanceAt = 0;
    return;
  }

}

export async function GET(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    if (!viewer) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }
    const { role, userId } = viewer;

    await runMaintenanceIfDue();
    if (role === "tailor") {
      await ensureTailorAssignmentNotifications(userId);
    }

    const params = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 50);
    const offset = Math.max(Number(params.get("offset")) || 0, 0);
    const unreadOnly = params.get("filter") === "unread";
    const countOnly = params.get("countOnly") === "true";

    let unreadQuery = supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("isRead", false);
    if (role === "tailor") {
      unreadQuery = unreadQuery
        .contains("target_roles", ["tailor"])
        .contains("metadata", { tailor_id: userId });
    } else {
      unreadQuery = unreadQuery.or(audience(role));
    }
    unreadQuery = unreadQuery.not("metadata", "cs", ownActionFilter(userId));

    if (countOnly) {
      const unreadResult = await unreadQuery;
      if (unreadResult.error) throw unreadResult.error;
      return NextResponse.json(
        { unreadCount: unreadResult.count ?? 0 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let query = supabaseAdmin
      .from("notifications")
      .select("id, title, message, type, link, isRead, created_at, metadata")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit);
    if (role === "tailor") {
      query = query
        .contains("target_roles", ["tailor"])
        .contains("metadata", { tailor_id: userId });
    } else {
      query = query.or(audience(role));
    }
    query = query.not("metadata", "cs", ownActionFilter(userId));

    if (unreadOnly) {
      query = query.eq("isRead", false);
    }

    const [listResult, unreadResult] = await Promise.all([query, unreadQuery]);

    if (listResult.error) throw listResult.error;
    if (unreadResult.error) throw unreadResult.error;

    const rows = (listResult.data ?? []) as {
      id: string;
      title: string;
      message: string;
      type: string;
      link: string | null;
      isRead: boolean;
      created_at: string;
      metadata: unknown;
    }[];
    // بنجيب limit + 1 عشان نعرف لو فيه صفحة تانية
    const hasMore = rows.length > limit;

    return NextResponse.json({
      notifications: rows.slice(0, limit).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        link: getNotificationLink(n.type, n.link, n.metadata),
        isRead: n.isRead,
        createdAt: n.created_at,
      })),
      unreadCount: unreadResult.count ?? 0,
      hasMore,
      nextOffset: offset + limit,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json({ message: "تعذر تحميل الإشعارات" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const viewer = await requireViewer();
    if (!viewer) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }
    const { role, userId } = viewer;

    const { id, markAll } = (await request.json()) as { id?: string; markAll?: boolean };

    if (markAll) {
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ isRead: true })
        .eq("isRead", false);
      if (role === "tailor") {
        updateQuery = updateQuery
          .contains("target_roles", ["tailor"])
          .contains("metadata", { tailor_id: userId });
      } else {
        updateQuery = updateQuery.or(audience(role));
      }
      const { error } = await updateQuery.not(
        "metadata",
        "cs",
        ownActionFilter(userId),
      );

      if (error) throw error;
      return NextResponse.json({ success: true, message: "تم تعليم جميع الإشعارات كمقروءة" });
    }

    if (id) {
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ isRead: true })
        .eq("id", id);
      if (role === "tailor") {
        updateQuery = updateQuery
          .contains("target_roles", ["tailor"])
          .contains("metadata", { tailor_id: userId });
      } else {
        updateQuery = updateQuery.or(audience(role));
      }
      const { error } = await updateQuery;

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "طلب غير مكتمل" }, { status: 400 });
  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return NextResponse.json({ message: "حدث خطأ أثناء تحديث الإشعارات" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const viewer = await requireViewer();
    if (!viewer) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }
    const { role, userId } = viewer;

    const params = request.nextUrl.searchParams;
    const id = params.get("id");
    const scope = params.get("scope");

    let query;

    if (id) {
      query = supabaseAdmin.from("notifications").delete().eq("id", id);
      if (role === "tailor") {
        query = query
          .contains("target_roles", ["tailor"])
          .contains("metadata", { tailor_id: userId });
      } else {
        query = query.or(audience(role));
      }
    } else if (scope === "read") {
      query = supabaseAdmin
        .from("notifications")
        .delete()
        .eq("isRead", true);
      if (role === "tailor") {
        query = query
          .contains("target_roles", ["tailor"])
          .contains("metadata", { tailor_id: userId });
      } else {
        query = query.or(audience(role));
      }
      query = query.not("metadata", "cs", ownActionFilter(userId));
    } else if (scope === "all") {
      query = supabaseAdmin
        .from("notifications")
        .delete()
        .gte("created_at", "1970-01-01T00:00:00Z");
      if (role === "tailor") {
        query = query
          .contains("target_roles", ["tailor"])
          .contains("metadata", { tailor_id: userId });
      } else {
        query = query.or(audience(role));
      }
      query = query.not("metadata", "cs", ownActionFilter(userId));
    } else {
      return NextResponse.json({ message: "حدد الإشعار أو نوع الحذف" }, { status: 400 });
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications DELETE error:", error);
    return NextResponse.json({ message: "حدث خطأ أثناء حذف الإشعارات" }, { status: 500 });
  }
}
