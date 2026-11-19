import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { conversionLine, insufficientMessage, planFunding, staleRateAge } from "@/lib/purchase-funding";

describe("معاينة تمويل دفع المشتريات (تحويل الناقص بالدولار من الجنيه)", () => {
  it("200$ + 5,000,000 ج.س، المطلوب 500$ بسعر 9,800 → تحويل 2,940,000 ج.س إلى 300$", () => {
    const plan = planFunding({ usd: 200, sdg: 5_000_000 }, 500, 9800);
    assert.deepEqual(plan, { amountUsd: 500, shortfallUsd: 300, sdgNeeded: 2_940_000, covered: true });
    assert.equal(conversionLine(plan, 9800), "سيتم تحويل 2,940,000 ج.س إلى 300.00$ بسعر 9,800");
  });

  it("الدولار يكفي → لا تحويل", () => {
    assert.deepEqual(planFunding({ usd: 600, sdg: 0 }, 500, 9800), { amountUsd: 500, shortfallUsd: 0, sdgNeeded: 0, covered: true });
  });

  it("الاثنان لا يكفيان، أو لا يوجد سعر صرف → رفض بنفس نص قاعدة البيانات", () => {
    assert.equal(planFunding({ usd: 200, sdg: 980_000 }, 500, 9800).covered, false);
    assert.equal(planFunding({ usd: 200, sdg: 9_000_000 }, 500, null).covered, false);
    assert.equal(
      insufficientMessage("cash", { usd: 200, sdg: 980_000 }, 500, 9800),
      "رصيد الخزينة غير كافٍ: المتاح 200.00$ و 980000.00 ج.س (= 100.00$)، والمطلوب 500.00$.",
    );
  });

  it("تنبيه سعر الصرف بعد 6 ساعات فقط", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    assert.equal(staleRateAge("2026-11-19T07:00:00Z", now), null);
    assert.equal(staleRateAge("2026-11-19T05:00:00Z", now), "7 ساعة");
    assert.equal(staleRateAge("2026-11-16T12:00:00Z", now), "3 يوم");
    assert.equal(staleRateAge(null, now), null);
  });
});
