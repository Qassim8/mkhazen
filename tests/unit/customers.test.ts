import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cleanCustomerPhone, isValidCustomerPhone, normalizeCustomerPhone, phoneSearchVariants } from "@/lib/customer-phone";
import { can, canAccessPath } from "@/lib/permissions";

describe("توحيد أرقام العملاء (lib/customer-phone)", () => {
  it("كل صيغ الرقم السوداني تتوحد إلى 249…", () => {
    for (const input of ["0912345678", "+249912345678", "249912345678", "912345678", "00249912345678", "+249 91-234 5678"]) {
      assert.equal(normalizeCustomerPhone(input), "249912345678", input);
    }
  });

  it("أرقام 01xxxxxxxx تتوحد أيضًا", () => {
    assert.equal(normalizeCustomerPhone("0112345678"), "249112345678");
  });

  it("الأرقام الأجنبية تبقى كما هي (أرقام فقط)", () => {
    assert.equal(normalizeCustomerPhone("+966 50 123 4567"), "966501234567");
  });

  it("القيم الفارغة تعطي نصًا فارغًا", () => {
    assert.equal(normalizeCustomerPhone(null), "");
    assert.equal(normalizeCustomerPhone(undefined), "");
    assert.equal(normalizeCustomerPhone("abc"), "");
  });

  it("cleanCustomerPhone يبقي الأرقام ويحذف 00 البادئة فقط", () => {
    assert.equal(cleanCustomerPhone("+249 912-345-678"), "249912345678");
    assert.equal(cleanCustomerPhone("00249912345678"), "249912345678");
    assert.equal(cleanCustomerPhone("0912345678"), "0912345678");
  });

  it("phoneSearchVariants: النص كما هو، والصيغة الموحدة، وبديل 249 لما يبدأ بصفر", () => {
    assert.deepEqual(phoneSearchVariants("0912"), ["0912", "249912"]);
    assert.deepEqual(phoneSearchVariants("+249 912 345 678"), ["249912345678"]);
    assert.deepEqual(phoneSearchVariants("علي"), []);
  });

  it("isValidCustomerPhone", () => {
    assert.equal(isValidCustomerPhone("0912345678"), true);
    assert.equal(isValidCustomerPhone("12345"), false);
    assert.equal(isValidCustomerPhone("1234567890123456"), false);
  });
});

describe("صلاحيات العملاء", () => {
  it("العرض والإنشاء والتعديل للمالك والمدير والكاشير، لا للخياط", () => {
    for (const permission of ["customers.view", "customers.create", "customers.update"] as const) {
      assert.equal(can("owner", permission), true, `owner ${permission}`);
      assert.equal(can("admin", permission), true, `admin ${permission}`);
      assert.equal(can("cashier", permission), true, `cashier ${permission}`);
      assert.equal(can("tailor", permission), false, `tailor ${permission}`);
    }
  });

  it("الحذف والدمج للمالك والمدير فقط", () => {
    for (const permission of ["customers.delete", "customers.merge"] as const) {
      assert.equal(can("owner", permission), true, `owner ${permission}`);
      assert.equal(can("admin", permission), true, `admin ${permission}`);
      assert.equal(can("cashier", permission), false, `cashier ${permission}`);
      assert.equal(can("tailor", permission), false, `tailor ${permission}`);
    }
  });

  it("مسار صفحة العملاء", () => {
    assert.equal(canAccessPath("cashier", "/dashboard/customers"), true);
    assert.equal(canAccessPath("cashier", "/dashboard/customers/abc"), true);
    assert.equal(canAccessPath("tailor", "/dashboard/customers"), false);
  });
});
