"use client";

/**
 * فواتير طلب التفصيل 80mm:
 *   • فاتورة العميل: بيانات العميل والقطعة، تاريخ الاستلام والتسليم المتوقع،
 *     الإجمالي والعربون والمدفوع والمتبقي. بدون أي تكاليف داخلية.
 *   • فاتورة الخياط: بلا أي مبالغ؛ اسم القطعة ووصفها والمقاسات والقماش والتواريخ.
 * mode = "both" تطبع الاثنتين في صفحة واحدة بينهما خط قص.
 * تظهر في الطباعة فقط (window.print) وباقي الصفحة مخفي.
 */

import { formatQuantity, formatSDG } from "@/lib/currency";
import { STORE_INFO } from "@/lib/store";

import type { TailoringOrder } from "../schemas/tailoring.schemas";

export type TailoringReceiptMode = "both" | "customer" | "tailor";

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
  const first = [...(order.payments ?? [])].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))[0];
  return (order.customerAdvanceTransferredIn ?? 0) + (first?.amount ?? 0);
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-[12px] font-bold" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="text-left">{value}</span>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="border-b border-dashed border-black pb-2 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={STORE_INFO.logo} alt={STORE_INFO.name} className="mx-auto mb-1 h-12 w-auto object-contain" />
      <p className="text-base font-bold">{STORE_INFO.name}</p>
      <p className="mt-1 inline-block rounded border border-black px-2 text-[11px] font-black">{title}</p>
    </div>
  );
}

function CustomerCopy({ order }: { order: TailoringOrder }) {
  return (
    <section className="px-3 py-2 text-[11px] text-black" dir="rtl">
      <Header title="فاتورة العميل" />

      <div className="space-y-1 border-b border-dashed border-black py-2">
        <Row label="رقم الطلب" value={order.orderNumber} strong />
        <Row label="العميل" value={order.customer?.name ?? "-"} />
        <Row label="واتساب" value={order.customer?.whatsappNumber ?? "-"} />
        <Row label="القطعة" value={order.tailoringItemName} />
        <Row label="تاريخ الاستلام" value={dateLabel(order.intakeDate)} />
        <Row label="التسليم المتوقع" value={dateLabel(order.expectedDeliveryDate)} strong />
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
    <section className="px-3 py-2 text-[11px] text-black" dir="rtl">
      <Header title="فاتورة الخياط" />

      <div className="space-y-1 border-b border-dashed border-black py-2">
        <Row label="رقم الطلب" value={order.orderNumber} strong />
        <Row label="الخياط" value={order.tailorName ?? order.tailor?.name ?? "-"} />
        <Row label="تاريخ الاستلام" value={dateLabel(order.intakeDate)} />
        <Row label="التسليم المتوقع" value={dateLabel(order.expectedDeliveryDate)} strong />
      </div>

      <div className="border-b border-dashed border-black py-2">
        <p className="text-[13px] font-black">{order.tailoringItemName}</p>
        {order.tailoringItemDescription && (
          <p className="mt-1 whitespace-pre-line text-[11px]">{order.tailoringItemDescription}</p>
        )}
      </div>

      <div className="border-b border-dashed border-black py-2">
        <p className="mb-1 text-[11px] font-bold">المقاسات</p>
        <table className="w-full text-[11px]">
          <tbody>
            {order.measurements.map((measurement, index) => (
              <tr key={`${measurement.label}-${index}`} className="border-b border-dotted border-gray-400 last:border-0">
                <td className="py-0.5">{measurement.label}</td>
                <td className="py-0.5 text-left font-bold" dir="ltr">
                  {formatQuantity(measurement.value)} {measurement.unit === "CM" ? "سم" : "متر"}
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
        {order.notes && <p className="mt-1 whitespace-pre-line text-[10px]">ملاحظات: {order.notes}</p>}
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
  return (
    <>
      <div id="tailoring-receipt-print" className="hidden print:block" aria-hidden="true">
        <div className="w-[80mm] bg-white">
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
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          html,
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #tailoring-receipt-print,
          #tailoring-receipt-print * {
            visibility: visible;
          }
          #tailoring-receipt-print {
            position: absolute;
            inset: 0 auto auto 0;
            width: 80mm;
          }
        }
      `}</style>
    </>
  );
}
