import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { can, canAccessPath, homePageFor, normalizeRole } from "@/lib/permissions";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import { canonicalJson, requestHash } from "@/lib/idempotency-hash";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyCheckoutSubtotal } from "@/app/api/sales/_lib/checkout-pricing";
import {
  allocateDeliveryCost,
  calculatePurchaseTotal,
  getPurchasePaymentStatus,
  normalizeConversionFactor,
} from "@/app/api/purchases/_lib/purchase-costs";
import { usdToSdg, sdgToUsd, formatSDG, formatUSD } from "@/lib/currency";

describe("الصلاحيات (lib/permissions)", () => {
  it("المالك والمدير والكاشير والخياط — صلاحيات العمليات الحساسة", () => {
    assert.equal(can("owner", "purchases.approve"), true);
    assert.equal(can("admin", "purchases.approve"), false);
    assert.equal(can("cashier", "sales.pos"), true);
    assert.equal(can("cashier", "accounting.view"), false);
    assert.equal(can("cashier", "sales.view"), false);
    assert.equal(can("tailor", "sales.pos"), false);
    assert.equal(can("tailor", "tailoring.view"), true);
    assert.equal(can("tailor", "tailoring.manage"), false);
    assert.equal(can("", "sales.pos"), false);
    assert.equal(can("superuser", "sales.pos"), false);
    assert.equal(can(" OWNER ", "accounting.manage"), true);
    assert.equal(normalizeRole("system_manager"), "admin");
  });

  it("الصفحات: الكاشير والخياط ما يفتحوش المحاسبة/المشتريات/التقارير", () => {
    for (const path of ["/dashboard", "/dashboard/accounting", "/dashboard/orders/new", "/dashboard/reports", "/dashboard/employees", "/dashboard/unknown-page"]) {
      assert.equal(canAccessPath("cashier", path), false, `cashier ${path}`);
      assert.equal(canAccessPath("tailor", path), false, `tailor ${path}`);
    }
    assert.equal(canAccessPath("cashier", "/dashboard/pos"), true);
    assert.equal(canAccessPath("cashier", "/dashboard/pos/receipt/x"), true);
    assert.equal(canAccessPath("tailor", "/dashboard/pos"), false);
    assert.equal(canAccessPath("tailor", "/dashboard/tailoring/abc"), true);
    assert.equal(canAccessPath("tailor", "/dashboard/tailoring/abc/edit"), false);
    assert.equal(canAccessPath("cashier", "/dashboard/tailoring/new"), true);
    assert.equal(canAccessPath("tailor", "/dashboard/tailoring/new"), false);
    assert.equal(canAccessPath("admin", "/dashboard/accounting"), true);
    // "/dashboard/posx" ما يطابقش prefix "/dashboard/pos"
    assert.equal(canAccessPath("cashier", "/dashboard/posx"), false);
    // الإعدادات للكل (تغيير كلمة السر)
    assert.equal(canAccessPath("tailor", "/dashboard/settings"), true);
  });

  it("الصفحة الرئيسية لكل دور متاحة له (مفيش حلقة تحويل)", () => {
    for (const role of ["owner", "admin", "cashier", "tailor", "unknown"]) {
      assert.equal(canAccessPath(role, homePageFor(role)), true, role);
    }
  });
});

describe("sanitizeSearchTerm (منع filter injection في PostgREST)", () => {
  it("بيشيل الرموز اللي بتغير شكل الفلتر", () => {
    assert.equal(sanitizeSearchTerm("x,isActive.eq.false"), "x isActive.eq.false");
    assert.equal(sanitizeSearchTerm("a)or(b"), "a or b");
    assert.equal(sanitizeSearchTerm('"quoted"'), "quoted");
    assert.equal(sanitizeSearchTerm("50%*"), "50");
    assert.equal(sanitizeSearchTerm("  جلابية   بيضاء  "), "جلابية بيضاء");
    assert.equal(sanitizeSearchTerm("JL-001_A"), "JL-001_A");
    assert.equal(sanitizeSearchTerm(undefined), "");
    assert.equal(sanitizeSearchTerm("x".repeat(500)).length, 100);
  });
});

describe("التحقق من أسعار السلة على السيرفر", () => {
  const variants = new Map([
    ["a", { sellingPrice: 10, isActive: true }],
    ["b", { sellingPrice: 3.333, isActive: true }],
    ["off", { sellingPrice: 5, isActive: false }],
  ]);

  it("نفس معادلة الكاشير: round2(round2(سعر × صرف) × كمية) والهدية صفر", () => {
    const rate = 2500.5;
    const expected = Math.round(Math.round(10 * rate * 100) / 100 * 2 * 100) / 100 + Math.round(Math.round(3.333 * rate * 100) / 100 * 1.5 * 100) / 100;
    const result = verifyCheckoutSubtotal({
      items: [
        { variantId: "a", quantity: 2, isGift: false },
        { variantId: "b", quantity: 1.5, isGift: false },
        { variantId: "a", quantity: 1, isGift: true },
      ],
      variants,
      rate,
      clientSubtotal: Math.round(expected * 100) / 100,
    });
    assert.equal(result.ok, true);
  });

  it("مجموع مرفوع من المتصفح (لتمرير خصم أكبر) بيترفض", () => {
    const result = verifyCheckoutSubtotal({
      items: [{ variantId: "a", quantity: 1, isGift: false }],
      variants,
      rate: 2500,
      clientSubtotal: 250000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "PRICE_CHANGED");
      assert.equal(result.subtotal, 25000);
    }
  });

  it("منتج غير نشط أو مش موجود بيترفض حتى لو هدية", () => {
    for (const variantId of ["off", "missing"]) {
      const result = verifyCheckoutSubtotal({
        items: [{ variantId, quantity: 1, isGift: true }],
        variants,
        rate: 2500,
        clientSubtotal: 0,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "VARIANT_UNAVAILABLE");
    }
  });
});

describe("تكلفة المشتريات (توزيع التوصيل والخصم)", () => {
  it("المثال الموثق: كرتونة 600 فيها 10 قطع + توصيل 50 = 65 للقطعة", () => {
    const [line] = allocateDeliveryCost(50, [{ quantity: 1, unitCost: 600, conversionFactor: 10 }]);
    assert.equal(line.sellingQuantity, 10);
    assert.equal(line.allocatedDeliveryCost, 50);
    assert.equal(line.effectiveUnitCost, 65);
    assert.equal(calculatePurchaseTotal([{ quantity: 1, unitCost: 600 }], 50), 650);
  });

  it("الخصم بيتوزع بنسبة قيمة السطر، والتكلفة ما تبقاش سالبة", () => {
    const lines = allocateDeliveryCost(
      0,
      [
        { quantity: 1, unitCost: 300, conversionFactor: 1 },
        { quantity: 1, unitCost: 100, conversionFactor: 1 },
      ],
      40,
    );
    assert.equal(lines[0].effectiveUnitCost, 270);
    assert.equal(lines[1].effectiveUnitCost, 90);
    const [huge] = allocateDeliveryCost(0, [{ quantity: 1, unitCost: 10 }], 1000);
    assert.equal(huge.effectiveUnitCost, 0);
    assert.equal(calculatePurchaseTotal([{ quantity: 1, unitCost: 10 }], 0, 1000), 0);
  });

  it("معامل التحويل غير الصالح = 1، وحالة الدفع", () => {
    assert.equal(normalizeConversionFactor(0), 1);
    assert.equal(normalizeConversionFactor(-3), 1);
    assert.equal(normalizeConversionFactor("abc"), 1);
    assert.equal(normalizeConversionFactor(12), 12);
    assert.equal(getPurchasePaymentStatus(100, 0), "UNPAID");
    assert.equal(getPurchasePaymentStatus(100, 40), "PARTIAL");
    assert.equal(getPurchasePaymentStatus(100, 100), "PAID");
  });
});

describe("العملات", () => {
  it("التحويل بسعر الصرف وعدم القسمة على صفر", () => {
    assert.equal(usdToSdg(10, 2500), 25000);
    assert.equal(sdgToUsd(25000, 2500), 10);
    assert.equal(sdgToUsd(25000, 0), 0);
    assert.equal(usdToSdg(10, null), 0);
    assert.equal(formatUSD(1234.5), "1,234.50 $");
    assert.equal(formatSDG(1234500), "1,234,500 ج.س");
    assert.equal(formatSDG(Number.NaN), "0 ج.س");
  });
});

describe("بصمة طلب منع التكرار", () => {
  it("ثابتة مع اختلاف ترتيب المفاتيح ومختلفة مع اختلاف البيانات", () => {
    assert.equal(canonicalJson({ b: 1, a: [1, { y: 2, x: 1 }] }), '{"a":[1,{"x":1,"y":2}],"b":1}');
    assert.equal(requestHash({ a: 1, b: 2 }), requestHash({ b: 2, a: 1 }));
    assert.notEqual(requestHash({ a: 1 }), requestHash({ a: 2 }));
    assert.equal(requestHash({ a: 1, u: undefined }), requestHash({ a: 1 }));
  });
});

describe("حد المحاولات", () => {
  it("بيوقف بعد الحد وبيرجع يسمح بعد انتهاء النافذة", () => {
    const key = `test:${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) assert.equal(checkRateLimit(key, 3, 1000, now).allowed, true);
    const blocked = checkRateLimit(key, 3, 1000, now + 10);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 1);
    assert.equal(checkRateLimit(key, 3, 1000, now + 1001).allowed, true);
  });
});

describe("جدول مسارات الـ API (lib/api-routes.ts)", () => {
  it("كل route تحت app/api متسجل (الـ Server Components بتستدعيهم داخليًا من خلاله)", () => {
    const root = join(__dirname, "..", "..");
    const apiDir = join(root, "app", "api");
    const routes: string[] = [];
    (function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/^route\.(ts|tsx)$/.test(name)) {
          routes.push("/" + relative(root, dir).split(/[\\/]/).join("/").replace(/^app\//, ""));
        }
      }
    })(apiDir);

    const table = readFileSync(join(root, "lib", "api-routes.ts"), "utf8");
    const registered = [...table.matchAll(/pattern: "([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual([...routes].sort(), [...new Set(registered)].sort());
  });
});

describe("مفيش Server Actions عامة متبقية", () => {
  it('مفيش ملف فيه directive "use server" (كانت بتكشف serverFetch و services للعامة)', () => {
    const root = join(__dirname, "..", "..");
    const offenders: string[] = [];
    for (const dir of ["app", "lib", "components", "store"]) {
      (function walk(current: string) {
        for (const name of readdirSync(current)) {
          const full = join(current, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(name)) {
            const firstStatement = readFileSync(full, "utf8").replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
            if (/^["']use server["']/.test(firstStatement)) offenders.push(relative(root, full));
          }
        }
      })(join(root, dir));
    }
    assert.deepEqual(offenders, []);
  });
});

describe("كلمة السر المؤقتة للموظف الجديد", () => {
  it("عشوائية وطولها 12 ومن غير حروف ملتبسة ومش مشتقة من البريد", async () => {
    const { generateTemporaryPassword } = await import("@/lib/temporary-password");
    const samples = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    assert.equal(samples.size, 200);
    for (const password of samples) {
      assert.equal(password.length, 12);
      assert.match(password, /^[A-HJ-NP-Za-km-z2-9]+$/);
      assert.ok(!password.includes("2026"));
    }
  });
});
