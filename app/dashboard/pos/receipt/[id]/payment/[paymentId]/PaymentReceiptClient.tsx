"use client";

import { useEffect } from "react";
import { LuPrinter } from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import ImageWithFallback from "@/components/shared/ImageWithFallback";
import { formatSDG } from "@/lib/currency";
import { STORE_INFO } from "@/lib/store";

import CreditValuationBlock from "../../../_components/CreditValuationBlock";

interface PaymentReceiptData {
  orderNumber: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  notes: string | null;
  receivedBy: string;
  totalAmount: number;
  remainingAfter: number;
  overpaid: number;
  dueDate: string | null;
  saleRate: number | null;
  currentRate: number | null;
  closedReason: "PAID" | "BAD_DEBT" | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "نقداً / الخزينة",
  CARD: "بطاقة",
  BANK_TRANSFER: "حوالة / البنك",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Africa/Khartoum" }),
    time: date.toLocaleTimeString("ar-SA-u-nu-latn", {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default function PaymentReceiptClient({ receipt }: { receipt: PaymentReceiptData }) {
  const { date, time } = formatDateTime(receipt.paymentDate);

  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b bg-white px-4 py-3 shadow-sm print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          <LuPrinter className="h-4 w-4" />
          طباعة الإيصال
        </button>
        <BackLink href="/dashboard/receivables" label="العودة إلى الذمم" />
      </div>

      <main className="min-h-screen bg-gray-100 py-20 print:min-h-0 print:bg-white print:p-0">
        <section
          className="receipt mx-auto w-[80mm] bg-white px-4 py-5 text-black print:m-0 print:w-[80mm] print:px-3 print:py-2"
          dir="rtl"
        >
          <div className="border-b border-dashed border-black pb-3 text-center">
            <ImageWithFallback
              src={STORE_INFO.logo}
              alt={STORE_INFO.name}
              width={48}
              height={48}
              unoptimized
              className="mx-auto mb-1 h-12 w-12 object-contain"
            />
            <h1 className="text-sm font-semibold">{STORE_INFO.name}</h1>
            <p className="mt-1 text-xs">إيصال دفعة — فاتورة آجلة</p>
          </div>

          <div className="space-y-1 border-b border-dashed border-black py-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>رقم الفاتورة</span>
              <span className="font-mono font-bold">{receipt.orderNumber}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>العميل</span>
              <span className="font-bold">{receipt.customerName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>الهاتف</span>
              <span dir="ltr">{receipt.customerPhone}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>التاريخ</span>
              <div>
                <span>{date}</span> _ <span>{time}</span>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span>استلمها</span>
              <span>{receipt.receivedBy}</span>
            </div>
          </div>

          <div className="space-y-1 border-b border-dashed border-black py-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>طريقة الدفع</span>
              <span>{METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm font-bold">
              <span>المبلغ المدفوع</span>
              <span>{formatSDG(receipt.amount)}</span>
            </div>
            {receipt.overpaid > 0 && (
              <div className="flex justify-between gap-3 text-[10px]">
                <span>منها زيادة عن المتبقي</span>
                <span>{formatSDG(receipt.overpaid)}</span>
              </div>
            )}
            {receipt.notes && <p className="text-[10px]">ملاحظة: {receipt.notes}</p>}
          </div>

          <div className="space-y-1 py-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>إجمالي الفاتورة</span>
              <span>{formatSDG(receipt.totalAmount)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-black pt-2 text-sm font-black">
              <span>المتبقي بعد هذه الدفعة</span>
              <span>{formatSDG(receipt.remainingAfter)}</span>
            </div>
            {receipt.remainingAfter > 0 && receipt.dueDate && (
              <div className="flex justify-between gap-3 font-bold">
                <span>تاريخ الاستحقاق</span>
                <span>{receipt.dueDate}</span>
              </div>
            )}
            {receipt.remainingAfter === 0 && (
              <p className="pt-1 text-center font-bold">
                {receipt.closedReason === "BAD_DEBT" ? "أُغلقت الفاتورة" : "تم سداد الفاتورة بالكامل"}
              </p>
            )}
          </div>

          {receipt.remainingAfter > 0 && (
            <CreditValuationBlock
              remainingSdg={receipt.remainingAfter}
              saleRate={receipt.saleRate}
              currentRate={receipt.currentRate}
            />
          )}

          <footer className="border-t border-dashed border-black pt-4 text-center text-[10px]">
            <p className="font-semibold">شكرًا لتعاملكم معنا</p>
            <p className="mt-1" dir="ltr">
              للتواصل: {STORE_INFO.phone}
            </p>
          </footer>
        </section>
      </main>

      <style jsx global>{`
        @page {
          size: 80mm auto;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: white;
          }
          aside,
          nav,
          header,
          .print\:hidden {
            display: none !important;
          }

          .receipt {
            break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
