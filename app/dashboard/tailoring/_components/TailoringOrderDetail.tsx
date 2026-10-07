"use client";

import BackLink from "@/components/shared/BackLink";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  LuBan,
  LuCheck,
  LuCircleAlert,
  LuClock3,
  LuDownload,
  LuFactory,
  LuFilePenLine,
  LuMessageCircle,
  LuPackage,
  LuRefreshCw,
  LuRotateCcw,
  LuShare2,
  LuWalletCards,
} from "react-icons/lu";

import {
  cancelTailoringOrder,
  completeTailoringPickup,
  payTailorPayment,
  refundCustomerAdvance,
  updateTailoringStatus,
} from "../services/tailoring.services";
import {
  cancelTailoringOrderSchema,
  completeTailoringPickupSchema,
  payTailorPaymentFormSchema,
  refundCustomerAdvanceSchema,
  type CompleteTailoringPickupInput,
  type PayTailorPaymentFormValues,
  type RefundCustomerAdvanceInput,
  type TailoringOrder,
} from "../schemas/tailoring.schemas";
import {
  createTailoringCustomerPdf,
  getTailoringCustomerMessage,
  getTailoringPdfFileName,
} from "./tailoringPdf";
import ProductionCompletionForm from "./ProductionCompletionForm";
import { formatSDG, formatUSD, sdgToUsd } from "@/lib/currency";
import { useExchangeRate } from "@/components/shared/useExchangeRate";

interface CategoryOption {
  id: string;
  name: string;
}

interface Props {
  order: TailoringOrder;
  canManageAll: boolean;
  canCollect: boolean;
  canManageStatus: boolean;
  categories: CategoryOption[];
}

const statusLabels: Record<TailoringOrder["tailoringStatus"], string> = {
  NEW: "طلب جديد",
  UNDER_TAILORING: "تحت التفصيل",
  READY_FOR_PICKUP: "جاهز",
  RECEIVED: "مكتمل",
  CANCELLED: "ملغي",
  CONVERTED_TO_PRODUCT: "محول لمنتج",
};

const statusClasses: Record<TailoringOrder["tailoringStatus"], string> = {
  NEW: "bg-gray-100 text-gray-700",
  UNDER_TAILORING: "bg-amber-50 text-amber-700",
  READY_FOR_PICKUP: "bg-blue-50 text-blue-700",
  RECEIVED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  CONVERTED_TO_PRODUCT: "",
};

/** تكاليف الخياطة والقماش والأرباح بالدولار */
function usd(value: number) {
  return formatUSD(value);
}

/** مبالغ الزبون (الإجمالي/العربون/الباقي) بالجنيه */
function money(value: number) {
  return `${value.toFixed(2)} ج.س`;
}

function dateLabel(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function dateTimeLabel(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function whatsappNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("05"))
    digits = `966${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith("5"))
    digits = `966${digits}`;
  return digits;
}

function whatsappLink(number: string, message: string) {
  return `https://wa.me/${whatsappNumber(number)}?text=${encodeURIComponent(message)}`;
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
      {message}
    </p>
  );
}

function ModalShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {children}
    </div>
  );
}

export default function TailoringOrderDetail({
  order,
  canManageAll,
  canCollect,
  canManageStatus,
  categories,
}: Props) {
  const router = useRouter();
  const { rate: exchangeRate } = useExchangeRate();
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const {
    register: registerPickup,
    handleSubmit: handleSubmitPickup,
    formState: { errors: pickupErrors, isSubmitting: pickupSubmitting },
    reset: resetPickup,
  } = useForm<CompleteTailoringPickupInput>({
    resolver: zodResolver(completeTailoringPickupSchema),
    defaultValues: { paymentMethod: "CASH" },
  });

  const {
    register: registerTailorPayment,
    handleSubmit: handleSubmitTailorPayment,
    formState: {
      errors: tailorPaymentErrors,
      isSubmitting: tailorPaymentSubmitting,
    },
    reset: resetTailorPayment,
  } = useForm<PayTailorPaymentFormValues>({
    resolver: zodResolver(payTailorPaymentFormSchema),
    defaultValues: { amount: "", paymentMethod: "CASH", currency: "SDG", notes: "" },
  });

  const {
    register: registerCancel,
    handleSubmit: handleSubmitCancel,
    formState: { errors: cancelErrors, isSubmitting: cancelSubmitting },
    reset: resetCancel,
  } = useForm<{ reason: string }>({
    resolver: zodResolver(cancelTailoringOrderSchema),
    defaultValues: { reason: "" },
  });

  const {
    register: registerRefund,
    handleSubmit: handleSubmitRefund,
    formState: { errors: refundErrors, isSubmitting: refundSubmitting },
    reset: resetRefund,
  } = useForm<RefundCustomerAdvanceInput>({
    resolver: zodResolver(refundCustomerAdvanceSchema),
    defaultValues: { amount: 0, paymentMethod: "CASH", notes: "" },
  });

  const overdue = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Khartoum",
    }).format(new Date());
    return (
      order.tailoringStatus !== "RECEIVED" &&
      order.tailoringStatus !== "CANCELLED" &&
      order.expectedDeliveryDate < today
    );
  }, [order.expectedDeliveryDate, order.tailoringStatus]);

  const isProduction = order.tailoringPurpose === "PRODUCTION";
  const canContactCustomer = canManageAll || canCollect;
  const productionCompleted = Boolean(order.producedProduct?.variantId);
  const canEdit = canManageAll && order.tailoringStatus === "NEW";
  const canCancel = canEdit;
  const canConvertCustomer =
    canManageAll &&
    !isProduction &&
    ["UNDER_TAILORING", "READY_FOR_PICKUP"].includes(order.tailoringStatus);
  const canRefundAdvance =
    canManageAll &&
    !isProduction &&
    order.tailoringStatus === "CANCELLED" &&
    order.customerAdvanceAvailable > 0;
  const canCreateReplacement = canRefundAdvance;
  const canPayTailor =
    canManageAll &&
    order.tailorRemainingAmountSdg > 0 &&
    (order.tailoringStatus !== "CANCELLED" ||
      Boolean(order.convertedToProductAt || order.producedProduct?.variantId));

  const tailorOrderMessage = useMemo(() => {
    const common = [
      `العمل: ${order.tailoringItemName}`,
      order.tailoringItemDescription
        ? `الوصف: ${order.tailoringItemDescription}`
        : null,
      `تاريخ الاستلام: ${dateLabel(order.intakeDate)}`,
      `التسليم المتوقع: ${dateLabel(order.expectedDeliveryDate)}`,
      "",
      "المقاسات:",
      ...order.measurements.map(
        (m) => `- ${m.label}: ${m.value} ${m.unit === "CM" ? "سم" : "متر"}`,
      ),
    ].filter(Boolean) as string[];

    if (isProduction) {
      return [
        `طلب تصنيع ${order.orderNumber}`,
        "الهدف: تصنيع منتج للمخزون",
        ...common,
        order.fabric
          ? `القماش من المحل: ${order.fabric.name} - الكمية ${order.fabricQuantity?.toFixed(2) ?? "0.00"} متر`
          : "القماش: غير موجود",
      ].join("\n");
    }

    return [
      `طلب تفصيل ${order.orderNumber}`,
      `العميل: ${order.customer?.name ?? "-"}`,
      `واتساب العميل: ${order.customer?.whatsappNumber ?? "-"}`,
      ...common,
      order.fabric
        ? `القماش من المحل: ${order.fabric.name} - الكمية ${order.fabricQuantity?.toFixed(2) ?? "0.00"} متر`
        : "القماش: العميل أحضر القماش",
    ].join("\n");
  }, [isProduction, order]);

  async function changeStatus(status: "UNDER_TAILORING" | "READY_FOR_PICKUP") {
    setActionLoading(true);
    try {
      await updateTailoringStatus(order.id, status);
      toast.success(
        status === "UNDER_TAILORING"
          ? "تم بدء التفصيل."
          : "تم تحديد الطلب كجاهز.",
      );
      router.refresh();
    } catch (error: unknown) {
      console.error("Update tailoring status:", error);
      toast.error(
        error instanceof Error ? error.message : "تعذر تحديث حالة الطلب.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  function openPickup() {
    resetPickup({ paymentMethod: "CASH" });
    setPickupOpen(true);
  }

  const submitPickup = handleSubmitPickup(
    async (values) => {
      setActionLoading(true);
      try {
        await completeTailoringPickup(order.id, values.paymentMethod);
        toast.success(
          order.remainingAmount > 0
            ? `تم تسليم الطلب وتحصيل ${money(order.remainingAmount)}.`
            : "تم تسليم الطلب دون مبلغ متبقٍ.",
        );
        setPickupOpen(false);
        router.refresh();
      } catch (error: unknown) {
        console.error("Complete tailoring pickup:", error);
        toast.error(
          error instanceof Error ? error.message : "تعذر إتمام استلام الطلب.",
        );
      } finally {
        setActionLoading(false);
      }
    },
    () => toast.error("تحقق من طريقة الدفع."),
  );

  function openTailorPayment() {
    // أجرة الخياط متفق عليها وتُدفع بالجنيه؛ الافتراضي = المتبقي بالجنيه
    resetTailorPayment({
      amount:
        order.tailorRemainingAmountSdg > 0
          ? order.tailorRemainingAmountSdg.toFixed(2)
          : "",
      paymentMethod: "CASH",
      currency: "SDG",
      notes: "",
    });
    setPaymentOpen(true);
  }

  const submitTailorPayment = handleSubmitTailorPayment(
    async (values) => {
      const amount = Number(values.amount);
      setActionLoading(true);
      try {
        await payTailorPayment({
          tailorId: order.tailorId,
          salesOrderId: order.id,
          amount,
          paymentMethod: values.paymentMethod,
          currency: "SDG",
          notes: values.notes?.trim() || null,
        });
        const paid = formatSDG(amount);
        toast.success(
          order.tailoringCostRecognized
            ? `تم سداد ${paid} من مستحقات الخياط.`
            : `تم تسجيل دفعة مقدمة للخياط بقيمة ${paid}.`,
        );
        setPaymentOpen(false);
        router.refresh();
      } catch (error: unknown) {
        console.error("Pay tailor payment:", error);
        toast.error(
          error instanceof Error ? error.message : "تعذر تسجيل دفعة الخياط.",
        );
      } finally {
        setActionLoading(false);
      }
    },
    () => toast.error("تحقق من مبلغ الدفعة والملاحظات الظاهرة تحت الحقول."),
  );

  async function handleDownloadCustomerPdf() {
    if (order.tailoringPurpose !== "CUSTOMER") return;
    setPdfLoading(true);
    try {
      const blob = await createTailoringCustomerPdf(order);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getTailoringPdfFileName(order);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تجهيز ملف PDF للطلب.");
    } catch (error: unknown) {
      console.error("Create tailoring PDF:", error);
      toast.error(
        error instanceof Error ? error.message : "تعذر إنشاء ملف PDF.",
      );
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleShareCustomerPdf() {
    if (
      order.tailoringPurpose !== "CUSTOMER" ||
      !order.customer?.whatsappNumber
    ) {
      toast.error("لا يوجد رقم واتساب صالح للعميل.");
      return;
    }

    setPdfLoading(true);
    try {
      const blob = await createTailoringCustomerPdf(order);
      const file = new File([blob], getTailoringPdfFileName(order), {
        type: "application/pdf",
      });
      const message = getTailoringCustomerMessage(order);
      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        await navigator.share({
          title: `طلب تفصيل ${order.orderNumber}`,
          text: message,
          files: [file],
        });
        toast.success("تم تجهيز PDF ومشاركته.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getTailoringPdfFileName(order);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      window.open(
        whatsappLink(order.customer.whatsappNumber, message),
        "_blank",
        "noopener,noreferrer",
      );
      toast.success("تم تجهيز PDF وفتح رسالة واتساب لإرفاقه يدويًا.");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Share tailoring PDF:", error);
      toast.error(
        error instanceof Error ? error.message : "تعذر تجهيز PDF للمشاركة.",
      );
    } finally {
      setPdfLoading(false);
    }
  }

  function openCancel() {
    resetCancel({ reason: "" });
    setCancelOpen(true);
  }

  const submitCancel = handleSubmitCancel(async (values) => {
    setActionLoading(true);
    try {
      await cancelTailoringOrder(order.id, { reason: values.reason.trim() });
      toast.success(
        `تم إلغاء الطلب ${order.orderNumber}. العربون لم يتحول إلى مبيعات.`,
      );
      setCancelOpen(false);
      router.refresh();
    } catch (error: unknown) {
      console.error("Cancel tailoring order:", error);
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء الطلب.");
    } finally {
      setActionLoading(false);
    }
  });

  function openRefund() {
    resetRefund({
      amount: Number(order.customerAdvanceAvailable.toFixed(2)),
      paymentMethod:
        order.paymentMethod === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH",
      notes: "",
    });
    setRefundOpen(true);
  }

  const submitRefund = handleSubmitRefund(
    async (values) => {
      setActionLoading(true);
      try {
        const result = await refundCustomerAdvance(order.id, {
          amount: Number(values.amount),
          paymentMethod: values.paymentMethod,
          notes: values.notes?.trim() || null,
        });
        toast.success(`تم استرداد ${money(result.data.amount)} للعميل.`);
        setRefundOpen(false);
        router.refresh();
      } catch (error: unknown) {
        console.error("Refund customer advance:", error);
        toast.error(
          error instanceof Error ? error.message : "تعذر استرداد عربون العميل.",
        );
      } finally {
        setActionLoading(false);
      }
    },
    () => toast.error("تحقق من مبلغ الاسترداد وطريقته."),
  );

  const openConversion = () => setConvertOpen(true);
  const closeConversion = () => setConvertOpen(false);

  return (
    <div className="space-y-5 p-4 pb-16">
      <header className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3">
            <BackLink href="/dashboard/tailoring" label="العودة إلى طلبات التفصيل" />
          </div>
          <h1 className="text-2xl font-black text-gray-950">
            {order.tailoringItemName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {order.orderNumber} ·{" "}
            {isProduction
              ? "تصنيع للمخزون"
              : canContactCustomer
                ? `${order.customer?.name ?? "-"} · ${order.customer?.whatsappNumber ?? "-"}`
                : order.customer?.name ?? "-"}
          </p>
          {order.tailoringItemDescription && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              {order.tailoringItemDescription}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-black text-white">
            {isProduction ? "تصنيع للمخزون" : "تفصيل عميل"}
          </span>
          <span
            className={`rounded-xl px-3 py-2 text-xs font-black ${statusClasses[order.tailoringStatus]}`}
          >
            {isProduction && order.tailoringStatus === "READY_FOR_PICKUP"
              ? "جاهز للإنتاج"
              : statusLabels[order.tailoringStatus]}
          </span>
          {overdue && (
            <span className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">
              متأخر
            </span>
          )}
        </div>
      </header>

      {canManageAll && order.tailoringStatus === "CANCELLED" && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            {order.convertedToProductAt ? (
              <LuPackage className="mt-0.5 h-5 w-5 text-red-700" />
            ) : (
              <LuCircleAlert className="mt-0.5 h-5 w-5 text-red-700" />
            )}
            <div className="text-xs text-red-900">
              <p className="font-black">
                {order.convertedToProductAt
                  ? "تم إلغاء الطلب تشغيليًا لأنه حُوّل إلى منتج للمخزون."
                  : "الطلب ملغي."}
              </p>
              {order.cancellationReason && (
                <p className="mt-1">السبب: {order.cancellationReason}</p>
              )}
              {order.convertedToProductAt && (
                <p className="mt-1">
                  وقت التحويل: {dateTimeLabel(order.convertedToProductAt)} — لم
                  يتم تسجيل مبيعات للطلب ولم يتم رد العربون تلقائيًا.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link
              href={`/dashboard/tailoring/${order.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              <LuFilePenLine className="h-4 w-4" />
              تعديل الطلب
            </Link>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={openCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <LuBan className="h-4 w-4" />
              إلغاء الطلب
            </button>
          )}

          {canManageStatus && order.tailoringStatus === "NEW" && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => changeStatus("UNDER_TAILORING")}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              بدء التفصيل
            </button>
          )}
          {canManageStatus && order.tailoringStatus === "UNDER_TAILORING" && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => changeStatus("READY_FOR_PICKUP")}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {isProduction ? "تحديد الإنتاج كجاهز" : "تحديد الطلب كجاهز"}
            </button>
          )}

          {!isProduction &&
            order.tailoringStatus === "READY_FOR_PICKUP" &&
            canCollect && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={openPickup}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <LuCheck className="h-4 w-4" />
                {order.remainingAmount > 0
                  ? "تسليم الطلب وتحصيل الباقي"
                  : "تأكيد تسليم الطلب"}
              </button>
            )}

          {isProduction &&
            order.tailoringStatus === "READY_FOR_PICKUP" &&
            canManageAll &&
            !productionCompleted && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setProductionOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <LuFactory className="h-4 w-4" />
                استلام الإنتاج وإنشاء المنتج
              </button>
            )}

          {!isProduction && canConvertCustomer && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={openConversion}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <LuRefreshCw className="h-4 w-4" />
              رفض العميل؟ تحويل القطعة إلى منتج
            </button>
          )}

          {isProduction &&
            order.tailoringStatus === "READY_FOR_PICKUP" &&
            !canManageAll && (
              <div className="rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700">
                الإنتاج جاهز وينتظر الكاشير لتحويله إلى منتج في المخزون.
              </div>
            )}

          {canPayTailor && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={openTailorPayment}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <LuWalletCards className="h-4 w-4" />
              {order.tailoringCostRecognized
                ? "سداد مستحق الخياط"
                : "دفع دفعة مقدمة للخياط"}
            </button>
          )}

          {canManageAll && order.tailorPhone && (
            <a
              href={whatsappLink(order.tailorPhone, tailorOrderMessage)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              <LuMessageCircle className="h-4 w-4" />
              واتساب الخياط
            </a>
          )}

          {canContactCustomer &&
            !isProduction &&
            order.customer?.whatsappNumber && (
            <>
              <button
                type="button"
                disabled={pdfLoading}
                onClick={handleDownloadCustomerPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <LuDownload className="h-4 w-4" />
                {pdfLoading ? "جارٍ تجهيز PDF..." : "PDF للعميل"}
              </button>
              <button
                type="button"
                disabled={pdfLoading}
                onClick={handleShareCustomerPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <LuShare2 className="h-4 w-4" />
                إرسال PDF عبر واتساب
              </button>
            </>
          )}

          {canRefundAdvance && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={openRefund}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <LuRotateCcw className="h-4 w-4" />
              استرداد العربون
            </button>
          )}

          {canCreateReplacement && (
            <Link
              href={`/dashboard/tailoring/new?transferFrom=${encodeURIComponent(order.id)}`}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
            >
              <LuRefreshCw className="h-4 w-4" />
              إنشاء طلب بديل ونقل العربون
            </Link>
          )}
        </div>

        {canCreateReplacement && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
            <p className="font-black">
              العربون المتاح: {money(order.customerAdvanceAvailable)}
            </p>
            <p className="mt-1">
              عند إنشاء طلب بديل لن تتحرك الخزينة أو البنك مرة ثانية؛ سيُنقل
              رصيد العربون محاسبيًا من هذا الطلب إلى الطلب الجديد، ويُحتسب
              لاحقًا ضمن مبلغ الطلب الجديد.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <LuClock3 className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-black text-gray-900">بيانات الطلب</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">
                اسم العمل / القطعة
              </p>
              <p className="mt-1 text-sm font-black">
                {order.tailoringItemName}
              </p>
            </div>
            <div
              className={`rounded-xl p-3 ${overdue ? "bg-red-50" : "bg-gray-50"}`}
            >
              <p className="text-[11px] font-bold text-gray-400">
                التسليم المتوقع
              </p>
              <p
                className={`mt-1 text-sm font-black ${overdue ? "text-red-600" : "text-gray-900"}`}
              >
                {dateLabel(order.expectedDeliveryDate)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">
                تاريخ الاستلام
              </p>
              <p className="mt-1 text-sm font-black">
                {dateLabel(order.intakeDate)}
              </p>
            </div>
            {canManageAll && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-bold text-gray-400">الخياط</p>
                <p className="mt-1 text-sm font-black">
                  {order.tailorName ?? "-"}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-black text-gray-900">الخامة</h2>
          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            {order.fabric ? (
              <>
                <p className="text-sm font-black">{order.fabric.name}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {canManageAll && order.fabric.sku
                    ? `SKU: ${order.fabric.sku} · `
                    : ""}
                  الكمية: {order.fabricQuantity?.toFixed(2) ?? "0.00"} متر
                </p>
                {canManageAll && (
                  <p className="mt-2 text-xs font-bold text-gray-700">
                    تكلفة الخامة المسجلة: {usd(order.fabricCost)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-black">قماش من العميل</p>
                <p className="mt-1 text-xs text-gray-500">
                  لا يوجد سحب من مخزون المحل لهذه الخامة.
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <LuPackage className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-black">المقاسات</h2>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {order.measurements.map((measurement, index) => (
              <div
                key={`${measurement.label}-${index}`}
                className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-xs"
              >
                <span className="font-semibold text-gray-500">
                  {measurement.label}
                </span>
                <span className="font-black text-gray-900">
                  {measurement.value} {measurement.unit === "CM" ? "سم" : "متر"}
                </span>
              </div>
            ))}
          </div>
          {canManageAll && order.notes && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-bold text-gray-400">ملاحظات</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                {order.notes}
              </p>
            </div>
          )}
        </section>

        {canManageAll && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black">الملخص المالي</h2>
            <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">قيمة الطلب</span>
              <strong>
                {isProduction
                  ? usd(order.totalCost)
                  : money(order.totalAmount)}
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">تكلفة القماش</span>
              <strong>{usd(order.fabricCost)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">أجرة الخياطة</span>
              <strong dir="ltr">
                {formatSDG(order.tailoringCostSdg)}
                <span className="mr-1 text-[10px] font-semibold text-gray-400">
                  ≈ {usd(order.tailoringCost)}
                </span>
              </strong>
            </div>
            {!isProduction && order.grossProfit != null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">
                  {order.revenueIsFinal ? "الربح الفعلي" : "الربح المتوقع"}
                  {order.exchangeRateUsed
                    ? ` (بسعر ${order.exchangeRateUsed.toLocaleString("en-US")})`
                    : ""}
                </span>
                <strong className={order.grossProfit < 0 ? "text-red-600" : "text-emerald-700"}>
                  {usd(order.grossProfit)}
                </strong>
              </div>
            )}
            {!isProduction && (
              <>
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-gray-500">العربون/الرصيد المسجل</span>
                  <strong>{money(order.paidAmount)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">الباقي عند التسليم</span>
                  <strong>{money(order.remainingAmount)}</strong>
                </div>
                {order.customerAdvanceAvailable > 0 &&
                  order.tailoringStatus === "CANCELLED" && (
                    <div className="rounded-xl bg-amber-50 p-3 text-amber-900">
                      <p className="font-black">عربون متاح للتصرف</p>
                      <p className="mt-1">
                        {money(order.customerAdvanceAvailable)}
                      </p>
                      <p className="mt-1 text-[11px]">
                        يمكن نقله إلى طلب بديل أو استرداده للعميل.
                      </p>
                    </div>
                  )}
              </>
            )}
            {order.tailorPaidAmountSdg > 0 && (
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                <span className="text-gray-500">المدفوع للخياط</span>
                <strong>{formatSDG(order.tailorPaidAmountSdg)}</strong>
              </div>
            )}
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">
                متبقي للخياط
              </p>
              <p className="mt-1 text-sm font-black">
                {formatSDG(order.tailorRemainingAmountSdg)}
              </p>
            </div>
            </div>
          </section>
        )}
      </div>

      {canManageAll && order.convertedToProductAt && order.producedProduct && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <LuPackage className="mt-0.5 h-5 w-5 text-emerald-700" />
            <div className="min-w-0 text-xs text-emerald-950">
              <p className="font-black">الطلب أصبح منتجًا في المخزون</p>
              <p className="mt-1">
                المنتج: <strong>{order.producedProduct.name}</strong> — الكمية:{" "}
                <strong>{order.producedProduct.quantity}</strong> قطعة — تكلفة
                الوحدة:{" "}
                <strong>{usd(order.producedProduct.averageCost)}</strong>
              </p>
              <p className="mt-1">
                سعر البيع: {usd(order.producedProduct.sellingPrice)}{" "}
                {order.producedProduct.sku
                  ? `· SKU: ${order.producedProduct.sku}`
                  : ""}
              </p>
            </div>
          </div>
        </section>
      )}

      {canManageAll && order.customerAdvanceMovements.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-black">
              حركة عربون العميل بين الطلبات
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              هذه الحركة لا تنقل نقدًا جديدًا؛ هي فقط تحدد أي طلب يحمل حق العميل
              في العربون.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-right">التاريخ</th>
                  <th className="px-5 py-3 text-right">الحركة</th>
                  <th className="px-5 py-3 text-right">المبلغ</th>
                  <th className="px-5 py-3 text-right">الطلب المرتبط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.customerAdvanceMovements.map((movement, index) => (
                  <tr
                    key={`${movement.direction}-${movement.createdAt}-${index}`}
                  >
                    <td className="px-5 py-3 text-gray-600">
                      {dateTimeLabel(movement.createdAt)}
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {movement.direction === "IN"
                        ? "استلام رصيد من طلب سابق"
                        : movement.direction === "OUT"
                          ? "نقل الرصيد إلى طلب بديل"
                          : "استرداد للعميل"}
                    </td>
                    <td dir="ltr" className="px-5 py-3 font-black">
                      {money(movement.amount)}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {movement.relatedOrderId ? (
                        <Link
                          href={`/dashboard/tailoring/${movement.relatedOrderId}`}
                          className="font-bold text-blue-700 hover:underline"
                        >
                          {movement.relatedOrderNumber ?? "عرض الطلب"}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManageAll &&
        !isProduction &&
        order.payments &&
        order.payments.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-black">دفعات العميل النقدية/البنكية</h2>
            <p className="mt-1 text-xs text-gray-400">
              هذه هي الدفعات التي دخلت الخزينة أو البنك فعليًا لهذا الطلب.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-right">التاريخ</th>
                  <th className="px-5 py-3 text-right">المبلغ</th>
                  <th className="px-5 py-3 text-right">الطريقة</th>
                  <th className="px-5 py-3 text-right">المرجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-5 py-3 text-gray-600">
                      {dateTimeLabel(payment.paymentDate)}
                    </td>
                    <td dir="ltr" className="px-5 py-3 font-black">
                      {money(payment.amount)}
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {payment.paymentMethod === "CASH"
                        ? "الخزينة"
                        : payment.paymentMethod === "BANK_TRANSFER"
                          ? "البنك"
                          : "بطاقة"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {payment.reference ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManageAll && order.tailorPayments && order.tailorPayments.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-black">دفعات الخياط</h2>
            <p className="mt-1 text-xs text-gray-400">
              التكلفة المتفق عليها: {formatSDG(order.tailoringCostSdg)} — المدفوع:{" "}
              {formatSDG(order.tailorPaidAmountSdg)} — المتبقي:{" "}
              {formatSDG(order.tailorRemainingAmountSdg)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-right">التاريخ</th>
                  <th className="px-5 py-3 text-right">النوع</th>
                  <th className="px-5 py-3 text-right">المبلغ</th>
                  <th className="px-5 py-3 text-right">الطريقة</th>
                  <th className="px-5 py-3 text-right">الملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.tailorPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-5 py-3 text-gray-600">
                      {dateTimeLabel(payment.createdAt)}
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {payment.paymentType === "ADVANCE"
                        ? "دفعة مقدمة"
                        : "سداد مستحق"}
                    </td>
                    <td dir="ltr" className="px-5 py-3 font-black">
                      {payment.currency === "SDG" && payment.amountOriginal != null
                        ? formatSDG(payment.amountOriginal)
                        : usd(payment.amount)}
                      {payment.currency === "SDG" && (
                        <span dir="ltr" className="block text-[10px] font-semibold text-gray-400">
                          ≈ {usd(payment.amount)}
                          {payment.exchangeRateUsed
                            ? ` @ ${payment.exchangeRateUsed.toLocaleString("en-US")}`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {payment.paymentMethod === "CASH" ? "الخزينة" : "البنك"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {payment.notes ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pickupOpen && (
        <ModalShell>
          <form
            onSubmit={submitPickup}
            dir="rtl"
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
            noValidate
          >
            <h3 className="text-sm font-black">تسليم الطلب وتحصيل الباقي</h3>
            <p className="text-sm text-gray-500">
              المتبقي من العميل: <strong>{money(order.remainingAmount)}</strong>
            </p>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                طريقة الدفع
              </span>
              <select
                {...registerPickup("paymentMethod")}
                disabled={pickupSubmitting || actionLoading}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="CASH">الخزينة</option>
                <option value="BANK_TRANSFER">البنك / تحويل</option>
              </select>
              <InlineError message={pickupErrors.paymentMethod?.message} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPickupOpen(false)}
                disabled={pickupSubmitting || actionLoading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={pickupSubmitting || actionLoading}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white"
              >
                {pickupSubmitting || actionLoading
                  ? "جارٍ التنفيذ..."
                  : "تأكيد الاستلام"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {paymentOpen && canManageAll && (
        <ModalShell>
          <form
            onSubmit={submitTailorPayment}
            dir="rtl"
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
            noValidate
          >
            <h3 className="text-sm font-black">
              {order.tailoringCostRecognized
                ? "سداد مستحق الخياط"
                : "دفع دفعة مقدمة للخياط"}
            </h3>
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <p>
                التكلفة المتفق عليها:{" "}
                <strong>{formatSDG(order.tailoringCostSdg)}</strong>
              </p>
              <p className="mt-1">
                المدفوع حتى الآن:{" "}
                <strong>{formatSDG(order.tailorPaidAmountSdg)}</strong>
              </p>
              <p className="mt-1">
                المتبقي: <strong>{formatSDG(order.tailorRemainingAmountSdg)}</strong>
              </p>
              {!order.tailoringCostRecognized && (
                <p className="mt-2 font-semibold text-blue-700">
                  هذه دفعة مقدمة فقط؛ لا تغيّر تكلفة الطلب، وستُسوّى عند تثبيت
                  تكلفة الخياطة.
                </p>
              )}
            </div>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                مبلغ الدفعة (ج.س)
              </span>
              <input
                {...registerTailorPayment("amount")}
                disabled={tailorPaymentSubmitting || actionLoading}
                type="number"
                min="0.01"
                step="0.01"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
              <InlineError message={tailorPaymentErrors.amount?.message} />
              {order.tailorRemainingAmountSdg > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-gray-500">
                  المتبقي للخياط: {formatSDG(order.tailorRemainingAmountSdg)}
                  {exchangeRate
                    ? ` (≈ ${usd(sdgToUsd(order.tailorRemainingAmountSdg, exchangeRate))} بسعر اليوم)`
                    : ""}
                </p>
              )}
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                طريقة الدفع
              </span>
              <select
                {...registerTailorPayment("paymentMethod")}
                disabled={tailorPaymentSubmitting || actionLoading}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="CASH">الخزينة</option>
                <option value="BANK">البنك</option>
              </select>
              <InlineError
                message={tailorPaymentErrors.paymentMethod?.message}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">ملاحظات</span>
              <textarea
                {...registerTailorPayment("notes")}
                rows={3}
                disabled={tailorPaymentSubmitting || actionLoading}
                className="mt-1 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
              <InlineError message={tailorPaymentErrors.notes?.message} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentOpen(false)}
                disabled={tailorPaymentSubmitting || actionLoading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={
                  tailorPaymentSubmitting ||
                  actionLoading ||
                  order.tailorRemainingAmountSdg <= 0
                }
                className="flex-1 rounded-xl bg-gray-900 py-2.5 text-xs font-bold text-white"
              >
                {tailorPaymentSubmitting || actionLoading
                  ? "جارٍ الحفظ..."
                  : "تسجيل الدفعة"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {cancelOpen && canCancel && (
        <ModalShell>
          <form
            onSubmit={submitCancel}
            dir="rtl"
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
            noValidate
          >
            <div>
              <h3 className="text-sm font-black">إلغاء طلب التفصيل</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                هذا المسار متاح فقط قبل بدء التفصيل. لن يتم رد العربون تلقائيًا؛
                بعد الإلغاء يمكنك استرداده أو نقله إلى طلب بديل.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                سبب الإلغاء
              </span>
              <textarea
                {...registerCancel("reason")}
                rows={4}
                disabled={cancelSubmitting || actionLoading}
                className="mt-1 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                placeholder="مثال: العميل عدل عن الطلب قبل بدء التنفيذ"
              />
              <InlineError message={cancelErrors.reason?.message} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                disabled={cancelSubmitting || actionLoading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={cancelSubmitting || actionLoading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white"
              >
                {cancelSubmitting || actionLoading
                  ? "جارٍ الإلغاء..."
                  : "تأكيد الإلغاء"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {refundOpen && canRefundAdvance && (
        <ModalShell>
          <form
            onSubmit={submitRefund}
            dir="rtl"
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
            noValidate
          >
            <div>
              <h3 className="text-sm font-black">استرداد عربون العميل</h3>
              <p className="mt-1 text-xs text-gray-500">
                العربون المتاح حاليًا:{" "}
                <strong>{money(order.customerAdvanceAvailable)}</strong>.
                الاسترداد ليس مصروفًا؛ هو إعادة مبلغ من التزام عربون العميل إلى
                الخزينة أو البنك.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">المبلغ</span>
              <input
                {...registerRefund("amount", { valueAsNumber: true })}
                disabled={refundSubmitting || actionLoading}
                type="number"
                min="0.01"
                max={order.customerAdvanceAvailable}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
              <InlineError message={refundErrors.amount?.message} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                طريقة الاسترداد
              </span>
              <select
                {...registerRefund("paymentMethod")}
                disabled={refundSubmitting || actionLoading}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              >
                <option value="CASH">الخزينة</option>
                <option value="BANK_TRANSFER">البنك</option>
              </select>
              <InlineError message={refundErrors.paymentMethod?.message} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">ملاحظات</span>
              <textarea
                {...registerRefund("notes")}
                rows={3}
                disabled={refundSubmitting || actionLoading}
                className="mt-1 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              />
              <InlineError message={refundErrors.notes?.message} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRefundOpen(false)}
                disabled={refundSubmitting || actionLoading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={refundSubmitting || actionLoading}
                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white"
              >
                {refundSubmitting || actionLoading
                  ? "جارٍ الاسترداد..."
                  : "تأكيد الاسترداد"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {isProduction && canManageAll && (
        <ProductionCompletionForm
          order={order}
          categories={categories}
          open={productionOpen}
          onClose={() => setProductionOpen(false)}
          onCompleted={() => router.refresh()}
          mode="PRODUCTION"
        />
      )}

      {!isProduction && canConvertCustomer && convertOpen && (
        <ProductionCompletionForm
          key={`convert-${order.id}`}
          order={order}
          categories={categories}
          open={convertOpen}
          onClose={closeConversion}
          onCompleted={() => router.refresh()}
          mode="CONVERT_CUSTOMER"
        />
      )}
    </div>
  );
}
