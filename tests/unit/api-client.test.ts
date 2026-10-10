import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  ApiError,
  assertSafeEndpoint,
  buildQueryString,
  errorFromResponse,
  registerServerTransport,
  serverFetch,
} from "@/lib/api-client";
import { safeReturnPath, isAuthErrorCode } from "@/lib/api-codes";

describe("assertSafeEndpoint (منع SSRF)", () => {
  it("بيقبل مسارات الـ API الداخلية العادية", () => {
    for (const ok of [
      "/api/products",
      "/api/products/0b6b5c2e-0a7d-4c39-9d63-2f6d7f6f5a11",
      "/api/sales/orders/abc-123/cancel",
      "/api/tailoring/orders/x/production-receive",
    ]) {
      assert.doesNotThrow(() => assertSafeEndpoint(ok), ok);
    }
  });

  it("بيرفض أي محاولة للخروج لموقع تاني أو مسار غير /api", () => {
    for (const bad of [
      "@evil.com/x",
      ".evil.com/api/x",
      "//evil.com/api/x",
      "http://evil.com/api/x",
      "https://169.254.169.254/latest/meta-data",
      "/api/../_next/static",
      "/api/./products",
      "/api/products/..",
      "/api/products?x=1",
      "/api/products#frag",
      "/api/pro%2e%2e/ducts",
      "/api",
      "/dashboard",
      "api/products",
      "/api/products\\..\\x",
      "/api/products @evil.com",
      "",
    ]) {
      assert.throws(() => assertSafeEndpoint(bad), ApiError, bad);
    }
  });
});

describe("buildQueryString", () => {
  it("بيتجاهل القيم الفاضية وبيعمل encode", () => {
    assert.equal(buildQueryString(undefined), "");
    assert.equal(buildQueryString({ a: undefined, b: null, c: "" }), "");
    assert.equal(buildQueryString({ search: "قميص أزرق", page: 2 }), "?search=%D9%82%D9%85%D9%8A%D8%B5+%D8%A3%D8%B2%D8%B1%D9%82&page=2");
  });
});

describe("errorFromResponse", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("بيحتفظ بالرسالة العربية والكود من الخادم", async () => {
    const error = await errorFromResponse(json(401, { message: "انتهت", code: "SESSION_EXPIRED" }));
    assert.equal(error.status, 401);
    assert.equal(error.code, "SESSION_EXPIRED");
    assert.equal(error.message, "انتهت");
    assert.equal(error.isAuthError, true);
  });

  it("بيقرا مفتاح error القديم وبيستنتج الكود من الحالة", async () => {
    const error = await errorFromResponse(json(403, { error: "غير مسموح" }));
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "غير مسموح");
    assert.equal(error.isForbidden, true);
    assert.equal(error.isAuthError, false);
  });

  it("رد مش JSON بيرجع رسالة عربية افتراضية حسب الحالة", async () => {
    const e500 = await errorFromResponse(new Response("<html>oops</html>", { status: 500 }));
    assert.equal(e500.code, "INTERNAL_ERROR");
    assert.match(e500.message, /خطأ داخلي/);
    const e503 = await errorFromResponse(new Response("", { status: 503 }));
    assert.equal(e503.isRetryable, true);
  });
});

describe("serverFetch في المتصفح", () => {
  const originalFetch = globalThis.fetch;
  const g = globalThis as Record<string, unknown>;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete g.window;
  });

  function fakeWindow() {
    const assigned: string[] = [];
    const events: string[] = [];
    g.window = {
      location: {
        pathname: "/dashboard/pos",
        search: "?tab=1",
        replace: (url: string) => assigned.push(url),
      },
      dispatchEvent: (event: { type: string }) => events.push(event.type),
    };
    (globalThis as Record<string, unknown>).CustomEvent ??= class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
    return { assigned, events };
  }

  it("401 بيحوّل لصفحة انتهاء الجلسة مع الرجوع لنفس الصفحة ويرمي ApiError", async () => {
    const { assigned, events } = fakeWindow();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "عذرًا، انتهت جلستك.", code: "SESSION_EXPIRED" }), {
        status: 401,
      })) as typeof fetch;

    await assert.rejects(serverFetch("/api/products"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "SESSION_EXPIRED");
      return true;
    });
    assert.deepEqual(assigned, ["/session-expired?next=%2Fdashboard%2Fpos%3Ftab%3D1"]);
    assert.deepEqual(events, ["mkhazen:session-expired"]);
  });

  it("403 ما بيحولش لتسجيل الدخول", async () => {
    const { assigned } = fakeWindow();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "ليس لديك صلاحية", code: "FORBIDDEN" }), { status: 403 })) as typeof fetch;
    await assert.rejects(serverFetch("/api/accounting"), /ليس لديك صلاحية/);
    assert.deepEqual(assigned, []);
  });

  it("انقطاع الشبكة = ApiError بحالة 0 (نتيجة غير معروفة)", async () => {
    fakeWindow();
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await assert.rejects(serverFetch("/api/products"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 0);
      assert.equal(error.isRetryable, true);
      return true;
    });
  });

  it("نقرتين على حفظ = طلب واحد بس (dedupe للطلبات المتطابقة الشغالة)", async () => {
    fakeWindow();
    let calls = 0;
    let release: () => void = () => undefined;
    globalThis.fetch = (async () => {
      calls++;
      await new Promise<void>((resolve) => (release = resolve));
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }) as typeof fetch;

    const body = JSON.stringify({ amount: 10 });
    const first = serverFetch("/api/purchases/x/payments", { method: "POST", body });
    const second = serverFetch("/api/purchases/x/payments", { method: "POST", body });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    assert.deepEqual(await first, { ok: true });
    assert.deepEqual(await second, { ok: true });
    assert.equal(calls, 1);

    // بعد ما الطلب خلص، طلب جديد بنفس البيانات بيتبعت عادي
    const third = serverFetch("/api/purchases/x/payments", { method: "POST", body });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await third;
    assert.equal(calls, 2);
  });

  it("بيبعت Content-Type و same-origin cookies ومش بيستخدم الكاش", async () => {
    fakeWindow();
    let seen: RequestInit | undefined;
    let url = "";
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      url = input;
      seen = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await serverFetch("/api/products", { params: { page: 2 } });
    assert.equal(url, "/api/products?page=2");
    assert.equal(seen?.credentials, "same-origin");
    assert.equal(seen?.cache, "no-store");
  });
});

describe("serverFetch في السيرفر", () => {
  it("بيستخدم الـ transport المسجّل (استدعاء داخلي من غير HTTP)", async () => {
    const calls: string[] = [];
    registerServerTransport(async <T,>(endpoint: string) => {
      calls.push(endpoint);
      return { endpoint } as T;
    });
    assert.deepEqual(await serverFetch("/api/products"), { endpoint: "/api/products" });
    assert.deepEqual(calls, ["/api/products"]);
    await assert.rejects(serverFetch("@evil.com/x"), ApiError);
    assert.deepEqual(calls, ["/api/products"], "unsafe endpoint never reaches the transport");
  });
});

describe("safeReturnPath (منع open redirect بعد تسجيل الدخول)", () => {
  it("بيقبل مسارات الداشبورد بس", () => {
    assert.equal(safeReturnPath("/dashboard"), "/dashboard");
    assert.equal(safeReturnPath("/dashboard/pos?x=1"), "/dashboard/pos?x=1");
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/dashboard\\..\\..\\evil",
      "/dashboardevil",
      "/dashboard.evil.com",
      "javascript:alert(1)",
      "/api/users",
      "/",
      "/dashboard/\u0000x",
      null,
      42,
    ]) {
      assert.equal(safeReturnPath(bad), null, String(bad));
    }
  });

  it("isAuthErrorCode", () => {
    assert.equal(isAuthErrorCode("SESSION_EXPIRED"), true);
    assert.equal(isAuthErrorCode("UNAUTHENTICATED"), true);
    assert.equal(isAuthErrorCode("FORBIDDEN"), false);
  });
});
