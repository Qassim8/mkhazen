import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { payTailorDuesSchema } from "@/app/dashboard/accounting/schemas/accounting.schema";
import { can } from "@/lib/permissions";

const base = {
  tailorId: "5b0f6f3e-3f1b-4a6e-9c51-0a6b7a2f9b11",
  amount: 1000,
  paymentMethod: "CASH",
  notes: null,
};

describe("سلف الخياط المنفصلة عن المستحقات: التحقق من الطلب", () => {
  it("الأنواع الثلاثة صالحة", () => {
    for (const kind of ["SETTLEMENT", "ADVANCE", "ADVANCE_RETURN"]) {
      assert.equal(payTailorDuesSchema.safeParse({ ...base, kind }).success, true, kind);
    }
    assert.equal(payTailorDuesSchema.safeParse({ ...base, kind: "LOAN" }).success, false);
  });

  it("الخصم من السلف اختياري ولا يقبل سالبًا أو أكثر من منزلتين", () => {
    assert.equal(payTailorDuesSchema.safeParse({ ...base, kind: "SETTLEMENT", deductAdvance: 400 }).success, true);
    assert.equal(payTailorDuesSchema.safeParse({ ...base, kind: "SETTLEMENT", deductAdvance: 0 }).success, true);
    assert.equal(payTailorDuesSchema.safeParse({ ...base, kind: "SETTLEMENT", deductAdvance: -1 }).success, false);
    assert.equal(payTailorDuesSchema.safeParse({ ...base, kind: "SETTLEMENT", deductAdvance: 1.234 }).success, false);
  });

  it("الصلاحيات كما هي: المالك والمدير فقط لمستحقات الخياطين", () => {
    assert.equal(can("owner", "accounting.manage"), true);
    assert.equal(can("admin", "accounting.manage"), true);
    assert.equal(can("cashier", "accounting.manage"), false);
    assert.equal(can("tailor", "payroll.manage"), false);
  });
});
