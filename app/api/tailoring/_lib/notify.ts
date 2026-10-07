import "server-only";

import type { TokenPayload } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * إشعارات تحديثات طلبات التفصيل.
 *
 * • تحديثات الطلبات تُرسل للمالك والمدير والكاشير، وللخياط المعيّن فقط.
 * • دفعات الخياط للإدارة بس (معلومة مالية).
 * • اللي عمل التحديث ما يوصلوش إشعار بنفسه (metadata.actor_id، والفلتر في /api/notifications).
 * • أي تحديث جديد للطلب بيعلّم التحديثات القديمة لنفس الطلب كمقروءة (اتجاوزها الحدث).
 * • فشل الإشعار ما يوقفش العملية الأصلية أبدًا.
 */

export type TailoringEvent =
  | "CREATED"
  | "UNDER_TAILORING"
  | "READY_FOR_PICKUP"
  | "RECEIVED"
  | "PRODUCTION_RECEIVED"
  | "CANCELLED"
  | "REFUNDED"
  | "CONVERTED"
  | "EDITED";

export const TAILORING_NOTIFICATION_TYPE = "TAILORING_UPDATE";

type OrderInfo = {
  id: string;
  order_number: string;
  tailoring_item_name: string | null;
  tailoring_purpose: "CUSTOMER" | "PRODUCTION" | null;
  expected_delivery_date: string | null;
  customer_id: string | null;
  tailor_id: string | null;
};

type NotificationRow = {
  title: string;
  message: string;
  type: string;
  link: string;
  target_roles: string[] | null;
  metadata: Record<string, unknown>;
};

const tailorAssignmentSyncAt = new Map<string, number>();
const TAILOR_ASSIGNMENT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

function tailorAssignmentKey(orderId: string) {
  return `TAILORING_ASSIGNMENT:${orderId}`;
}

function makeTailorAssignmentNotification(
  order: OrderInfo,
  customerName: string | null,
): NotificationRow {
  return {
    title: "طلب تفصيل جديد مسند إليك",
    message: `${describeOrder(order, customerName)} أُسند إليك للتنفيذ.`,
    type: TAILORING_NOTIFICATION_TYPE,
    link: `/dashboard/tailoring/${order.id}`,
    target_roles: ["tailor"],
    metadata: {
      key: tailorAssignmentKey(order.id),
      sales_order_id: order.id,
      tailor_id: order.tailor_id,
      event: "ASSIGNED",
    },
  };
}

/** ينشئ تنبيهات مرة واحدة للطلبات الحالية التي أُسندت قبل تفعيل تنبيهات الخياط. */
export async function ensureTailorAssignmentNotifications(tailorId: string) {
  const lastSyncAt = tailorAssignmentSyncAt.get(tailorId) ?? 0;
  if (Date.now() - lastSyncAt < TAILOR_ASSIGNMENT_SYNC_INTERVAL_MS) return;

  if (!MAIN_BRANCH_ID) {
    throw new Error("معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام.");
  }

  const { data: orders, error } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, tailoring_item_name, tailoring_purpose, expected_delivery_date, customer_id, tailor_id",
    )
    .eq("branch_id", MAIN_BRANCH_ID)
    .eq("tailor_id", tailorId)
    .eq("order_type", "TAILORING")
    .in("tailoring_status", ["NEW", "UNDER_TAILORING"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(`تعذر جلب طلبات الخياط المسندة: ${error.message}`);
  if (!orders?.length) {
    tailorAssignmentSyncAt.set(tailorId, Date.now());
    return;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("notifications")
    .select("metadata")
    .eq("type", TAILORING_NOTIFICATION_TYPE)
    .contains("target_roles", ["tailor"])
    .contains("metadata", { tailor_id: tailorId });

  if (existingError) {
    throw new Error(`تعذر التحقق من تنبيهات الطلبات المسندة: ${existingError.message}`);
  }

  const existingKeys = new Set(
    (existing ?? []).map((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      return metadata?.key;
    }),
  );
  const missingOrders = orders.filter(
    (order) => !existingKeys.has(tailorAssignmentKey(order.id)),
  );

  if (!missingOrders.length) {
    tailorAssignmentSyncAt.set(tailorId, Date.now());
    return;
  }

  const customerIds = [
    ...new Set(
      missingOrders
        .map((order) => order.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: customers, error: customersError } = customerIds.length
    ? await supabaseAdmin
        .from("customers")
        .select("id, name")
        .in("id", customerIds)
    : { data: [], error: null };
  if (customersError) {
    throw new Error(`تعذر جلب أسماء عملاء طلبات الخياط: ${customersError.message}`);
  }
  const customerNames = new Map(
    (customers ?? []).map((customer) => [customer.id, customer.name]),
  );
  const rows = missingOrders.map((order) =>
    makeTailorAssignmentNotification(
      order,
      customerNames.get(order.customer_id ?? "") ?? null,
    ),
  );
  if (rows.length) await insertRows(rows);
  tailorAssignmentSyncAt.set(tailorId, Date.now());
}

async function loadOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, tailoring_item_name, tailoring_purpose, expected_delivery_date, customer_id, tailor_id",
    )
    .eq("id", orderId)
    .maybeSingle<OrderInfo>();

  if (!order) return null;

  const [customer, tailor] = await Promise.all([
    order.customer_id
      ? supabaseAdmin
          .from("customers")
          .select("name, whatsapp_number")
          .eq("id", order.customer_id)
          .maybeSingle<{ name: string | null; whatsapp_number: string | null }>()
      : Promise.resolve({ data: null }),
    order.tailor_id
      ? supabaseAdmin
          .from("users")
          .select("name")
          .eq("id", order.tailor_id)
          .maybeSingle<{ name: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    order,
    customerName: customer.data?.name ?? null,
    customerPhone: customer.data?.whatsapp_number ?? null,
    tailorName: tailor.data?.name ?? null,
  };
}

function describeOrder(order: OrderInfo, customerName: string | null) {
  const item = order.tailoring_item_name ? ` «${order.tailoring_item_name}»` : "";
  const customer = customerName ? ` للعميل ${customerName}` : "";
  return `الطلب ${order.order_number}${item}${customer}`;
}

function buildContent(
  event: TailoringEvent,
  info: NonNullable<Awaited<ReturnType<typeof loadOrder>>>,
  details?: string | null,
) {
  const { order, customerName, customerPhone, tailorName } = info;
  const subject = describeOrder(order, customerName);
  const isProduction = order.tailoring_purpose === "PRODUCTION";
  const suffix = details ? ` ${details}` : "";

  switch (event) {
    case "CREATED":
      return {
        title: isProduction ? "طلب تصنيع جديد" : "طلب تفصيل جديد",
        message:
          `${subject}` +
          (tailorName ? ` — الخياط: ${tailorName}` : "") +
          (order.expected_delivery_date ? ` — التسليم ${order.expected_delivery_date}` : "") +
          ".",
      };
    case "UNDER_TAILORING":
      return {
        title: "بدأ التفصيل",
        message: `${tailorName ? `${tailorName} بدأ تفصيل` : "بدأ تفصيل"} ${subject}.`,
      };
    case "READY_FOR_PICKUP":
      return isProduction
        ? {
            title: "إنتاج جاهز للاستلام",
            message: `${subject} جاهز، ويمكن استلامه وإضافته للمخزون.`,
          }
        : {
            title: "طلب جاهز للاستلام",
            message:
              `${subject} جاهز للتسليم.` +
              (customerPhone ? ` تواصل مع العميل (${customerPhone}).` : ""),
          };
    case "RECEIVED":
      return {
        title: "تم تسليم طلب تفصيل",
        message: `تم تسليم ${subject} وتحصيل المبلغ المتبقي.`,
      };
    case "PRODUCTION_RECEIVED":
      return {
        title: "تم استلام إنتاج",
        message: `تم استلام ${subject} وإضافته للمخزون.${suffix}`,
      };
    case "CANCELLED":
      return {
        title: "تم إلغاء طلب تفصيل",
        message: `تم إلغاء ${subject}.${suffix}`,
      };
    case "REFUNDED":
      return {
        title: "استرداد عربون",
        message: `تم رد العربون للعميل في ${subject}.${suffix}`,
      };
    case "CONVERTED":
      return {
        title: "تحويل طلب إلى منتج",
        message: `تم تحويل ${subject} إلى منتج في المخزون.${suffix}`,
      };
    case "EDITED":
      return {
        title: "تعديل طلب تفصيل",
        message: `تم تعديل بيانات ${subject}.`,
      };
  }
}

function withActor(message: string, actor: TokenPayload | null) {
  return actor?.name ? `${message} (بواسطة ${actor.name})` : message;
}

async function insertRows(rows: NotificationRow[]) {
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) throw new Error(`Tailoring notification insert: ${error.message}`);
}

/** إشعار بتحديث في طلب تفصيل — للمالك والمدير والكاشير */
export async function notifyTailoringUpdate(input: {
  orderId: string;
  event: TailoringEvent;
  actor: TokenPayload | null;
  /** تفاصيل إضافية تتضاف لنهاية الرسالة (سبب الإلغاء، اسم المنتج…) */
  details?: string | null;
}) {
  try {
    const info = await loadOrder(input.orderId);
    if (!info) return;

    const content = buildContent(input.event, info, input.details);

    // التحديثات القديمة لنفس الطلب اتجاوزها الحدث ده
    await supabaseAdmin
      .from("notifications")
      .update({ isRead: true })
      .eq("type", TAILORING_NOTIFICATION_TYPE)
      .eq("metadata->>sales_order_id", info.order.id)
      .eq("isRead", false);

    const base = {
      title: content.title,
      message: withActor(content.message, input.actor),
      type: TAILORING_NOTIFICATION_TYPE,
      link: `/dashboard/tailoring/${info.order.id}`,
      metadata: {
        key: `TAILORING:${info.order.id}:${input.event}`,
        sales_order_id: info.order.id,
        event: input.event,
        actor_id: input.actor?.userId ?? null,
      },
    };

    const rows: NotificationRow[] = [
      { ...base, target_roles: ["owner", "admin", "cashier"] },
    ];

    if (info.order.tailor_id) {
      const tailorMessage =
        input.event === "CREATED"
          ? `${describeOrder(info.order, info.customerName)} أُسند إليك للتنفيذ.`
          : `${describeOrder(info.order, info.customerName)}: ${content.title}.`;
      rows.push({
        ...base,
        title:
          input.event === "CREATED"
            ? "طلب تفصيل جديد مسند إليك"
            : content.title,
        message: tailorMessage,
        target_roles: ["tailor"],
        metadata: {
          ...base.metadata,
          key:
            input.event === "CREATED"
              ? tailorAssignmentKey(info.order.id)
              : base.metadata.key,
          tailor_id: info.order.tailor_id,
        },
      });
    }

    await insertRows(rows);
  } catch (error) {
    console.error("notifyTailoringUpdate:", error);
  }
}

/** إشعار بدفعة للخياط — للإدارة بس */
export async function notifyTailorPayment(input: {
  tailorId: string;
  amount: number;
  currency: string;
  salesOrderId: string | null;
  isAdvance: boolean;
  actor: TokenPayload | null;
}) {
  try {
    const [{ data: tailor }, order] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("name")
        .eq("id", input.tailorId)
        .maybeSingle<{ name: string | null }>(),
      input.salesOrderId
        ? supabaseAdmin
            .from("sales_orders")
            .select("order_number")
            .eq("id", input.salesOrderId)
            .maybeSingle<{ order_number: string }>()
        : Promise.resolve({ data: null }),
    ]);

    const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
      input.amount,
    );
    const currency = input.currency === "USD" ? "$" : "ج.س";
    const orderPart = order.data?.order_number ? ` عن الطلب ${order.data.order_number}` : "";

    await insertRows([
      {
        title: input.isAdvance ? "دفعة مقدمة للخياط" : "سداد مستحقات خياط",
        message: withActor(
          `تم دفع ${amount} ${currency} للخياط ${tailor?.name ?? ""}${orderPart}.`.replace(/\s+\./, "."),
          input.actor,
        ),
        type: "TAILOR_PAYMENT",
        link: input.salesOrderId
          ? `/dashboard/tailoring/${input.salesOrderId}`
          : "/dashboard/accounting/journals",
        target_roles: null,
        metadata: {
          tailor_id: input.tailorId,
          sales_order_id: input.salesOrderId,
          actor_id: input.actor?.userId ?? null,
        },
      },
    ]);
  } catch (error) {
    console.error("notifyTailorPayment:", error);
  }
}
