import "server-only";

import type { TokenPayload } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * إشعارات تحديثات طلبات التفصيل.
 *
 * • تحديثات الطلبات تُرسل للإدارة (المالك والمدير: target_roles = NULL).
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
  if (error) console.error("Tailoring notification insert:", error);
}

/** إشعار بتحديث في طلب تفصيل — للإدارة */
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

    await insertRows([{ ...base, target_roles: null }]);
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
