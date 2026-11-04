import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPurchasePaymentSchema, purchasePaymentSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

const base = {
  paymentDate: "2026-11-04",
  reference: null,
  notes: null,
};

describe("دفعة المشتريات المختلطة (خزنة + بنك): التحقق من الطلب", () => {
  it("الطرق الثلاث صالحة والمختلط يتطلب أن يساوي مجموع الجزأين المبلغ", () => {
    assert.equal(purchasePaymentSchema.safeParse({ ...base, amount: 100, paymentMethod: "CASH" }).success, true);
    assert.equal(purchasePaymentSchema.safeParse({ ...base, amount: 100, paymentMethod: "BANK" }).success, true);
    assert.equal(
      purchasePaymentSchema.safeParse({ ...base, amount: 100, paymentMethod: "MIXED", cashAmount: 60, bankAmount: 40 }).success,
      true,
    );
    assert.equal(
      purchasePaymentSchema.safeParse({ ...base, amount: 100, paymentMethod: "MIXED", cashAmount: 60, bankAmount: 30 }).success,
      false,
    );
    assert.equal(purchasePaymentSchema.safeParse({ ...base, amount: 100, paymentMethod: "MIXED" }).success, false);
  });

  it("جزء واحد صفر مقبول، والسالب مرفوض، وطريقة غير معروفة مرفوضة", () => {
    assert.equal(
      purchasePaymentSchema.safeParse({ ...base, amount: 50, paymentMethod: "MIXED", cashAmount: 0, bankAmount: 50 }).success,
      true,
    );
    assert.equal(
      purchasePaymentSchema.safeParse({ ...base, amount: 50, paymentMethod: "MIXED", cashAmount: -10, bankAmount: 60 }).success,
      false,
    );
    assert.equal(purchasePaymentSchema.safeParse({ ...base, amount: 50, paymentMethod: "CHEQUE" }).success, false);
  });

  it("نفس القاعدة في مسار الدفعة اللاحقة", () => {
    const orderId = "5b0f6f3e-3f1b-4a6e-9c51-0a6b7a2f9b11";
    assert.equal(
      createPurchasePaymentSchema.safeParse({ ...base, purchaseOrderId: orderId, amount: 10.1, paymentMethod: "MIXED", cashAmount: 5.05, bankAmount: 5.05 }).success,
      true,
    );
    assert.equal(
      createPurchasePaymentSchema.safeParse({ ...base, purchaseOrderId: orderId, amount: 10, paymentMethod: "MIXED", cashAmount: 5, bankAmount: 4 }).success,
      false,
    );
  });
});
