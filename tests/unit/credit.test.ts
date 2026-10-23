import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { overpaymentNote, salesPaymentBadge, creditValuation } from "@/lib/credit";
import { canAccessPath } from "@/lib/permissions";
import {
  EMPTY_CREDIT,
  creditPaidNow,
  creditRemaining,
  validateCredit,
} from "@/app/dashboard/pos/_components/credit-form";

describe("البيع بالتقسيط — تقييم المتبقي", () => {
  it("المتبقي بسعر البيع واليوم والخسارة والمعادل", () => {
    const v = creditValuation({ remainingSdg: 30_000, saleRate: 2500, currentRate: 3000 });
    assert.equal(v.usdAtSale, 12);
    assert.equal(v.usdNow, 10);
    assert.equal(v.lossUsd, 2);
    assert.equal(v.lossPct, 16.67);
    assert.equal(v.equivalentSdgToday, 36_000);
  });

  it("سعر صرف ناقص → لا أرقام مضللة", () => {
    const v = creditValuation({ remainingSdg: 1000, saleRate: 2500, currentRate: null });
    assert.equal(v.usdAtSale, 0.4);
    assert.equal(v.usdNow, null);
    assert.equal(v.lossPct, null);
    assert.equal(v.equivalentSdgToday, null);
  });

  it("ملاحظة تعويض فرق الصرف", () => {
    assert.match(overpaymentNote(500), /تعويض فرق الصرف.*500/);
  });
});

describe("شارة حالة الدفع في المبيعات", () => {
  it("مدفوعة / جزئية / آجلة / معدوم", () => {
    assert.equal(salesPaymentBadge({ paymentStatus: "PAID" }).label, "مدفوعة");
    assert.equal(salesPaymentBadge({ paymentStatus: "PARTIAL" }).label, "جزئية");
    assert.equal(salesPaymentBadge({ paymentStatus: "PARTIAL", isCredit: true }).label, "آجلة");
    assert.equal(salesPaymentBadge({ paymentStatus: "UNPAID", isCredit: true }).label, "آجلة");
    assert.equal(salesPaymentBadge({ paymentStatus: "PAID", isCredit: true, creditClosedReason: "PAID" }).label, "مدفوعة");
    assert.equal(salesPaymentBadge({ paymentStatus: "PARTIAL", isCredit: true, creditClosedReason: "BAD_DEBT" }).label, "معدوم");
  });
});

describe("نموذج تقسيط الكاشير", () => {
  const credit = (patch: Partial<typeof EMPTY_CREDIT>) => ({ ...EMPTY_CREDIT, enabled: true, name: "محمد", phone: "0912", ...patch });

  it("المتبقي يُحسب تلقائيًا من المدفوع الآن", () => {
    assert.equal(creditPaidNow(credit({ paidNow: "20000" })), 20_000);
    assert.equal(creditRemaining(credit({ paidNow: "20000" }), 50_000), 30_000);
    assert.equal(creditRemaining(credit({ paidNow: "" }), 50_000), 50_000);
  });

  it("الاسم والهاتف إلزاميان والمدفوع أقل من الإجمالي", () => {
    assert.equal(validateCredit(EMPTY_CREDIT, 100, false), null, "غير مفعّل = لا تحقق");
    assert.match(validateCredit(credit({ name: " " }), 100, false) ?? "", /اسم العميل/);
    assert.match(validateCredit(credit({ phone: "" }), 100, false) ?? "", /هاتف/);
    assert.match(validateCredit(credit({ paidNow: "100" }), 100, false) ?? "", /أقل من إجمالي/);
    assert.match(validateCredit(credit({ paidNow: "150" }), 100, false) ?? "", /أقل من إجمالي/);
    assert.match(validateCredit(credit({ paidNow: "-5" }), 100, false) ?? "", /غير صالح/);
    assert.match(validateCredit(credit({}), 0, true) ?? "", /الهدايا/);
    assert.equal(validateCredit(credit({ paidNow: "40" }), 100, false), null);
    assert.equal(validateCredit(credit({ paidNow: "" }), 100, false), null, "بدون دفعة مقدمة مسموح");
  });
});

describe("صفحة ذمم العملاء", () => {
  it("للكاشير وما فوق فقط", () => {
    assert.equal(canAccessPath("cashier", "/dashboard/receivables"), true);
    assert.equal(canAccessPath("admin", "/dashboard/receivables"), true);
    assert.equal(canAccessPath("owner", "/dashboard/receivables"), true);
    assert.equal(canAccessPath("tailor", "/dashboard/receivables"), false);
    assert.equal(canAccessPath("cashier", "/dashboard/pos/receipt/x/payment/y"), true);
  });
});
