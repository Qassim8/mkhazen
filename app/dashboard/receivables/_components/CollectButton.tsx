"use client";

import { useState } from "react";
import { LuBanknote } from "react-icons/lu";

import type { CollectTarget, ReceivableKind } from "../services/receivables.services";
import { PaymentModal, TailoringPickupModal } from "./ReceivableModals";

/**
 * زر "تحصيل" الموحد (صفحة الذمم وصفحة العميل) — يستدعي الدالة الصحيحة حسب النوع:
 *   POS_CREDIT            → record_credit_payment (نافذة تسجيل دفعة)
 *   TAILORING_IN_PROGRESS → complete_tailoring_pickup (تسليم الطلب وتحصيل المتبقي)
 * المتبقي وإمكانية التحصيل تأتي من get_unified_receivables (قاعدة البيانات) في الشاشتين.
 * لو المتبقي = 0 لا يظهر الزر. طلب التفصيل لا يُحصَّل قبل أن يصبح "جاهز للاستلام".
 */
export default function CollectButton({
  kind,
  row,
  canCollect,
  onDone,
  className = "",
}: {
  kind: ReceivableKind;
  row: CollectTarget;
  canCollect: boolean;
  onDone: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!(Number(row.remaining_sdg ?? 0) > 0)) return null;

  if (!canCollect) {
    return (
      <span className="inline-flex min-h-9 items-center rounded-lg bg-gray-50 px-3 text-[11px] font-semibold text-gray-500">
        يُحصَّل عند تسليم الطلب (جاهز للاستلام)
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-(--primary-red) px-3 text-xs font-bold text-white hover:opacity-90 md:min-h-9 ${className}`}
      >
        <LuBanknote className="h-3.5 w-3.5" />
        تحصيل
      </button>

      {open && kind === "POS_CREDIT" && (
        <PaymentModal
          row={row}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onDone();
          }}
        />
      )}
      {open && kind === "TAILORING_IN_PROGRESS" && (
        <TailoringPickupModal
          row={row}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onDone();
          }}
        />
      )}
    </>
  );
}
