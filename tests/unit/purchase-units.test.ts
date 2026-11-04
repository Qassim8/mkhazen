import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describePurchaseQuantity,
  largeQuantityWarning,
  pricePerSellingUnit,
  purchaseUnitInfo,
  stockQuantity,
} from "@/lib/purchase-units";

const carton = purchaseUnitInfo({ purchaseUnit: "كرتونة", sellingUnit: "قطعة", conversionFactor: 24 });
const piece = purchaseUnitInfo({ purchaseUnit: "قطعة", sellingUnit: "قطعة", conversionFactor: 1 });

describe("وحدة الشراء ووحدة البيع في المشتريات (عرض فقط)", () => {
  it("ما يُضاف للمخزون = الكمية × المعامل، والسعر لكل وحدة بيع = السعر ÷ المعامل", () => {
    assert.equal(stockQuantity(10, carton), 240);
    assert.equal(pricePerSellingUnit(120, carton), 5);
    assert.equal(stockQuantity(3, piece), 3);
  });

  it("المعامل غير الصالح يُعامل كـ 1 والوحدات الناقصة لها قيم افتراضية", () => {
    assert.equal(purchaseUnitInfo({ conversionFactor: 0 }).factor, 1);
    assert.equal(purchaseUnitInfo({ conversionFactor: "abc" }).factor, 1);
    assert.deepEqual(purchaseUnitInfo(null), { purchaseUnit: "وحدة", sellingUnit: "وحدة", factor: 1 });
    assert.equal(purchaseUnitInfo({ purchaseUnit: "كرتونة" }).sellingUnit, "كرتونة");
  });

  it("وصف الكمية بالوحدتين، والوحدة فقط لو المعامل 1", () => {
    assert.equal(describePurchaseQuantity(10, carton), "10 كرتونة (240 قطعة)");
    assert.equal(describePurchaseQuantity(5, piece), "5 قطعة");
  });

  it("التنبيه فقط لو المعامل > 1 والكمية ≥ 10", () => {
    assert.equal(largeQuantityWarning(9, carton), null);
    assert.equal(largeQuantityWarning(10, piece), null);
    assert.equal(
      largeQuantityWarning(10, carton),
      "تأكد: أدخلت 10 كرتونة = 240 قطعة. لو كنت تقصد 10 قطعة فقط، اكتب 0.42 كرتونة.",
    );
  });
});
