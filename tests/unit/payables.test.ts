import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createAssetSchema,
  createManualJournalEntrySchema,
} from "@/app/dashboard/accounting/schemas/accounting.schema";
import { can, canAccessPath } from "@/lib/permissions";

const asset = {
  name: "ماكينة",
  category: "MACHINE",
  purchaseValue: 1000,
  purchaseDate: "2026-10-01",
  paymentMethod: "CASH",
  currency: "USD",
};

describe("الدفع المجزأ: الصلاحيات", () => {
  it("من يسجّل الأصول والمصروفات يدفع المستحقات (المالك والمدير والكاشير)، لا الخياط", () => {
    for (const role of ["owner", "admin", "cashier"] as const) {
      assert.equal(can(role, "payables.manage"), true, role);
      assert.equal(can(role, "assets.create"), true, role);
      assert.equal(can(role, "expenses.record"), true, role);
    }
    assert.equal(can("tailor", "payables.manage"), false);
  });

  it("صفحة المستحقات مفتوحة للكاشير رغم إغلاق المحاسبة عليه", () => {
    assert.equal(canAccessPath("cashier", "/dashboard/accounting/payables"), true);
    assert.equal(canAccessPath("cashier", "/dashboard/accounting"), false);
    assert.equal(canAccessPath("tailor", "/dashboard/accounting/payables"), false);
  });
});

describe("الدفع المجزأ: التحقق من الأجزاء", () => {
  it("أصل بلا أجزاء (السلوك القديم) صالح", () => {
    const result = createAssetSchema.safeParse(asset);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.ownerPaid, undefined);
      assert.equal(result.data.paidNow, undefined);
      assert.equal(result.data.remaining, undefined);
    }
  });

  it("أصل بثلاثة أجزاء مجموعها القيمة الكاملة صالح", () => {
    const result = createAssetSchema.safeParse({ ...asset, ownerPaid: 300, paidNow: 500, remaining: 200, dueDate: "2026-12-01" });
    assert.equal(result.success, true);
  });

  it("المجموع لا يساوي القيمة → مرفوض", () => {
    const result = createAssetSchema.safeParse({ ...asset, ownerPaid: 300, paidNow: 500, remaining: 100 });
    assert.equal(result.success, false);
  });

  it("جزء سالب أو بأكثر من منزلتين → مرفوض", () => {
    assert.equal(createAssetSchema.safeParse({ ...asset, ownerPaid: -1, paidNow: 1001, remaining: 0 }).success, false);
    assert.equal(createAssetSchema.safeParse({ ...asset, paidNow: 999.999, remaining: 0.001 }).success, false);
  });

  it("تاريخ استحقاق بصيغة خاطئة → مرفوض، والفارغ يُعامل كغير موجود", () => {
    assert.equal(createAssetSchema.safeParse({ ...asset, paidNow: 500, remaining: 500, dueDate: "غدًا" }).success, false);
    assert.equal(createAssetSchema.safeParse({ ...asset, paidNow: 500, remaining: 500, dueDate: "" }).success, true);
  });

  it("مصروف: الأجزاء تُقارن بالمبلغ، وطريقة الدفع غير مطلوبة لو لن يُدفع شيء الآن", () => {
    const base = { entryType: "EXPENSE", amount: 1000, account: "UTILITIES", description: "كهرباء", currency: "SDG" };

    assert.equal(createManualJournalEntrySchema.safeParse({ ...base, paymentMethod: "CASH" }).success, true);
    assert.equal(createManualJournalEntrySchema.safeParse({ ...base }).success, false, "لا تجزئة: طريقة الدفع مطلوبة");
    assert.equal(
      createManualJournalEntrySchema.safeParse({ ...base, ownerPaid: 400, paidNow: 0, remaining: 600 }).success,
      true,
      "دفعه المالك + مستحق فقط",
    );
    assert.equal(
      createManualJournalEntrySchema.safeParse({ ...base, paymentMethod: "CASH", paidNow: 500, remaining: 600 }).success,
      false,
    );
  });

  it("الأجزاء لا تُقبل على غير المصروف", () => {
    const result = createManualJournalEntrySchema.safeParse({
      entryType: "CAPITAL",
      amount: 100,
      paymentMethod: "CASH",
      description: "رأس مال",
      paidNow: 50,
      remaining: 50,
    });
    assert.equal(result.success, false);
  });
});
