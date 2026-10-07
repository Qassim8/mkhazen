"use client";

import BackLink from "@/components/shared/BackLink";
import { useEffect } from "react";
import { LuGift, LuPrinter } from "react-icons/lu";

interface ReceiptItem {
  id: string;
  productName: string;
  sku?: string | null;
  variantLabel?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isGift: boolean;
  giftNote?: string | null;
}

interface ReceiptData {
  id: string;
  orderNumber: string;
  orderType: string;
  createdAt: string;
  completedAt?: string | null;
  branchName: string;
  cashierName: string;
  customerName?: string | null;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  exchangeRate?: number | null;
  paymentStatus: string;
  status: string;
  notes?: string | null;
  items: ReceiptItem[];
}

interface Props {
  receipt: ReceiptData;
}

function formatMoney(value: number) {
  return `${Number(value).toFixed(2)} ج.س`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("ar-SA-u-nu-latn", {
      timeZone: "Africa/Khartoum",
    }),
    time: date.toLocaleTimeString("ar-SA-u-nu-latn", {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function getPaymentMethodLabel(method: string) {
  switch (method) {
    case "CASH":
      return "نقدي";
    case "CARD":
      return "بطاقة";
    case "BANK_TRANSFER":
      return "تحويل بنكي";
    case "MIXED":
      return "دفع مختلط";
    default:
      return method;
  }
}

export default function ReceiptPrintClient({ receipt }: Props) {
  const { date, time } = formatDateTime(receipt.createdAt);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print();
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b bg-white px-4 py-3 shadow-sm print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          <LuPrinter className="h-4 w-4" />
          طباعة الفاتورة
        </button>
        <BackLink href="/dashboard/pos" label="العودة إلى الكاشير" />
      </div>

      <main className="min-h-screen bg-gray-100 py-20 print:min-h-0 print:bg-white print:p-0">
        <section
          className="receipt mx-auto w-[80mm] bg-white px-4 py-5 text-black print:m-0 print:w-[80mm] print:px-3 print:py-2"
          dir="rtl"
        >
          <header className="border-b border-dashed border-black pb-3 text-center">
            <h1 className="text-lg font-bold">متجري</h1>
            <p className="mt-1 text-xs">فاتورة بيع</p>
          </header>

          <div className="space-y-1 border-b border-dashed border-black py-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>رقم الطلب</span>
              <span className="font-mono font-bold">{receipt.orderNumber}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>التاريخ</span>
              <div>
                <span>{date}</span> _ <span>{time}</span>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span>الكاشير</span>
              <span>{receipt.cashierName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>طريقة الدفع</span>
              <span>{getPaymentMethodLabel(receipt.paymentMethod)}</span>
            </div>
          </div>

          <div className="py-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 border-b border-black pb-2 text-[10px] font-bold">
              <span>الصنف</span>
              <span>الكمية</span>
              <span>الإجمالي</span>
            </div>

            <div className="space-y-3">
              {receipt.items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-dashed border-gray-400 pb-2 last:border-0"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    {item.isGift && <LuGift className="h-3 w-3 shrink-0" />}
                    <span>{item.productName}</span>
                    {item.isGift && (
                      <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-bold">
                        هدية
                      </span>
                    )}
                  </div>

                  {item.variantLabel && (
                    <div className="mt-0.5 text-[9px] text-gray-600">
                      {item.variantLabel}
                    </div>
                  )}

                  {item.sku && (
                    <div className="mt-0.5 font-mono text-[9px] text-gray-500">
                      SKU: {item.sku}
                    </div>
                  )}

                  {item.isGift && item.giftNote && (
                    <div className="mt-1 text-[9px] text-gray-600">
                      السبب: {item.giftNote}
                    </div>
                  )}

                  <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px]">
                    <span>{formatMoney(item.unitPrice)}</span>
                    <span className="text-center">{item.quantity}</span>
                    <span className="font-semibold">
                      {formatMoney(item.totalPrice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-dashed border-black pt-3 text-[11px]">
            <div className="flex justify-between">
              <span>المجموع الفرعي</span>
              <span>{formatMoney(receipt.subtotal)}</span>
            </div>

            {receipt.discountAmount > 0 && (
              <>
                <div className="flex justify-between">
                  <span>الخصم</span>
                  <span>-{formatMoney(receipt.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>نسبة الخصم</span>
                  <span>{receipt.discountPercentage.toFixed(2)}%</span>
                </div>
              </>
            )}

            {receipt.taxAmount > 0 && (
              <div className="flex justify-between">
                <span>الضريبة</span>
                <span>{formatMoney(receipt.taxAmount)}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-black pt-2 text-sm font-bold">
              <span>الإجمالي</span>
              <span>{formatMoney(receipt.totalAmount)}</span>
            </div>
          </div>

          <footer className="border-t border-dashed border-black pt-4 text-center text-[10px]">
            <p className="font-semibold">شكرًا لزيارتكم</p>
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
