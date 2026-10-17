"use client";

/**
 * فواتير طلب التفصيل 80mm:
 *   • فاتورة العميل: بيانات العميل والقطعة، تاريخ الاستلام والتسليم المتوقع،
 *     الإجمالي والعربون والمدفوع والمتبقي. بدون أي تكاليف داخلية.
 *   • فاتورة الخياط: بلا أي مبالغ؛ اسم القطعة ووصفها والمقاسات والقماش والتواريخ.
 * mode = "both" تطبع الاثنتين في ورقة واحدة بينهما خط قص.
 *
 * الطباعة:
 *   • الفاتورة تُرسم مباشرة داخل <body> (Portal) خارج تخطيط الصفحة.
 *   • عند الطباعة يُخفى باقي الصفحة بـ display:none (وليس visibility)
 *     فيصبح طول المستند = طول الفاتورة فقط، بلا مساحة بيضاء.
 *   • طول الورقة يُقاس تلقائيًا ويُكتب في @page (80mm × الطول الفعلي)
 *     حتى تقص الطابعة الحرارية مباشرة بعد آخر سطر.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { formatQuantity, formatSDG } from "@/lib/currency";
import { STORE_INFO } from "@/lib/store";

import type { TailoringOrder } from "../schemas/tailoring.schemas";

export type TailoringReceiptMode = "both" | "customer" | "tailor";

const PX_PER_MM = 96 / 25.4;
/** هامش أمان بسيط أسفل الفاتورة حتى لا ينزل سطر لورقة ثانية */
const BOTTOM_SAFETY_MM = 3;

/** true في المتصفح فقط (بدون setState داخل useEffect) */
const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

/** العربون = المنقول من طلب سابق + أول دفعة على الطلب */
function depositAmount(order: TailoringOrder) {
  const first = [...(order.payments ?? [])].sort((a, b) =>
    a.paymentDate.localeCompare(b.paymentDate),
  )[0];
  return (order.customerAdvanceTransferredIn ?? 0) + (first?.amount ?? 0);
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "text-[12px] font-bold" : ""}`}
    >
      <span className="shrink-0">{label}</span>
      <span className="text-left">{value}</span>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="border-b border-dashed border-black pb-2 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={STORE_INFO.logo}
        alt={STORE_INFO.name}
        loading="eager"
        className="mx-auto mb-1 h-12 w-auto object-contain"
      />
      <p className="text-base font-bold">{STORE_INFO.name}</p>
      <p className="mt-1 inline-block rounded border border-black px-2 text-[11px] font-black">
        {title}
      </p>
    </div>
  );
}

function CustomerCopy({ order }: { order: TailoringOrder }) {
  return (
    <section
      className="receipt-copy px-3 py-2 text-[11px] text-black"
      dir="rtl"
    >
      <Header title="فاتورة العميل" />

      <div className="space-y-1 border-b border-dashed border-black py-2">
        <Row label="رقم الطلب" value={order.orderNumber} strong />
        <Row label="العميل" value={order.customer?.name ?? "-"} />
        <Row label="واتساب" value={order.customer?.whatsappNumber ?? "-"} />
        <Row label="القطعة" value={order.tailoringItemName} />
        <Row label="تاريخ الاستلام" value={dateLabel(order.intakeDate)} />
        <Row
          label="التسليم المتوقع"
          value={dateLabel(order.expectedDeliveryDate)}
          strong
        />
      </div>

      <div className="space-y-1 py-2">
        <Row label="الإجمالي" value={formatSDG(order.totalAmount)} strong />
        <Row label="العربون" value={formatSDG(depositAmount(order))} />
        <Row label="المدفوع" value={formatSDG(order.paidAmount)} />
        <Row label="المتبقي" value={formatSDG(order.remainingAmount)} strong />
      </div>

      <p className="border-t border-dashed border-black pt-2 text-center text-[10px]">
        يُرجى إحضار هذه الفاتورة عند الاستلام
      </p>
      <p className="text-center text-[10px]" dir="ltr">
        للتواصل: {STORE_INFO.phone}
      </p>
    </section>
  );
}

function TailorCopy({ order }: { order: TailoringOrder }) {
  return (
    <section
      className="receipt-copy px-3 py-2 text-[11px] text-black"
      dir="rtl"
    >
      <Header title="فاتورة الخياط" />

      <div className="space-y-1 border-b border-dashed border-black py-2">
        <Row label="رقم الطلب" value={order.orderNumber} strong />
        <Row
          label="الخياط"
          value={order.tailorName ?? order.tailor?.name ?? "-"}
        />
        <Row label="تاريخ الاستلام" value={dateLabel(order.intakeDate)} />
        <Row
          label="التسليم المتوقع"
          value={dateLabel(order.expectedDeliveryDate)}
          strong
        />
      </div>

      <div className="border-b border-dashed border-black py-2">
        <p className="text-[13px] font-black">{order.tailoringItemName}</p>
        {order.tailoringItemDescription && (
          <p className="mt-1 whitespace-pre-line text-[11px]">
            {order.tailoringItemDescription}
          </p>
        )}
      </div>

      <div className="border-b border-dashed border-black py-2">
        <p className="mb-1 text-[11px] font-bold">المقاسات</p>
        <table className="w-full text-[11px]">
          <tbody>
            {order.measurements.map((measurement, index) => (
              <tr
                key={`${measurement.label}-${index}`}
                className="border-b border-dotted border-gray-400 last:border-0"
              >
                <td className="py-0.5">{measurement.label}</td>
                <td className="py-0.5 text-left font-bold" dir="ltr">
                  {formatQuantity(measurement.value)}{" "}
                  {measurement.unit === "CM" ? "سم" : "متر"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="py-2">
        <Row
          label="القماش"
          value={
            order.fabric
              ? `${order.fabric.name} — ${formatQuantity(order.fabricQuantity ?? 0)} متر`
              : "من العميل"
          }
        />
        {order.notes && (
          <p className="mt-1 whitespace-pre-line text-[10px]">
            ملاحظات: {order.notes}
          </p>
        )}
      </div>
    </section>
  );
}

export default function TailoringReceipt({
  order,
  mode = "both",
}: {
  order: TailoringOrder;
  mode?: TailoringReceiptMode;
}) {
  const isClient = useIsClient();
  const paperRef = useRef<HTMLDivElement | null>(null);

  // قياس الطول الفعلي للفاتورة وكتابته مباشرة في <style> داخل <head>
  // (بدون state — يتحدث تلقائيًا عند تحميل الشعار أو تغيير المحتوى)
  useEffect(() => {
    if (!isClient) return;
    const element = paperRef.current;
    if (!element) return;

    const pageStyle = document.createElement("style");
    pageStyle.setAttribute("data-tailoring-receipt-page", "");
    document.head.appendChild(pageStyle);

    const measure = () => {
      const px = element.getBoundingClientRect().height;
      if (px <= 0) return;
      const heightMm = Math.ceil(px / PX_PER_MM) + BOTTOM_SAFETY_MM;
      pageStyle.textContent = `@media print { @page { size: 80mm ${heightMm}mm; margin: 0; } }`;
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("beforeprint", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", measure);
      pageStyle.remove();
    };
  }, [isClient, mode, order]);

  if (!isClient) return null;

  return createPortal(
    <>
      <div id="tailoring-receipt-print" aria-hidden="true">
        <div ref={paperRef} className="receipt-paper bg-white text-black">
          {mode !== "tailor" && <CustomerCopy order={order} />}
          {mode === "both" && (
            <div className="my-2 flex items-center gap-1 px-2 text-[9px] text-black">
              <span>✂</span>
              <span className="flex-1 border-t border-dashed border-black" />
              <span>قص هنا</span>
              <span className="flex-1 border-t border-dashed border-black" />
            </div>
          )}
          {mode !== "customer" && <TailorCopy order={order} />}
        </div>
      </div>

      <style jsx global>{`
        /* على الشاشة: خارج الصفحة تمامًا (لكن قابلة للقياس) */
        #tailoring-receipt-print {
          position: fixed;
          top: 0;
          left: -10000px;
          width: 80mm;
          visibility: hidden;
          pointer-events: none;
        }

        #tailoring-receipt-print .receipt-paper {
          width: 80mm;
          margin: 0;
          padding: 0;
        }

        @media print {
          @page {
            margin: 0;
          }

          html,
          body {
            width: 80mm !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: white !important;
          }

          /* كل شيء غير الفاتورة يختفي فعليًا ولا يأخذ أي مساحة */
          body > *:not(#tailoring-receipt-print) {
            display: none !important;
          }

          #tailoring-receipt-print {
            display: block !important;
            position: static !important;
            left: auto !important;
            visibility: visible !important;
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          #tailoring-receipt-print .receipt-copy {
            break-inside: avoid;
          }

          #tailoring-receipt-print * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </>,
    document.body,
  );
}
