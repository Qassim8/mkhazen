/**
 * اختبار تكامل حقيقي: بيشغّل نسخة الإنتاج (next start) على خادم Supabase وهمي.
 * بيختبر الـ proxy والـ API routes والكوكيز وصفحة "انتهت جلستك" ومنع التكرار.
 *
 * المتطلبات: npm run build أولًا. التشغيل: npm run test:e2e
 * ⚠️ مفيش أي اتصال بقاعدة العميل: SUPABASE_URL بيشاور على الخادم الوهمي،
 * وفي الآخر بنتأكد إن كل طلبات قاعدة البيانات وصلت للخادم الوهمي.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

import { startMockPostgrest, type MockState } from "./mock-postgrest";
import { passwordFingerprint } from "@/lib/session-token";

const ROOT = join(__dirname, "..", "..");
const JWT_SECRET = "e2e-test-secret-e2e-test-secret-0123456789";
const BRANCH_ID = "dcc40a00-1275-463f-9cd8-caf5487100b0";

const PASSWORDS = { owner: "Owner#Pass123", admin: "Admin#Pass1234", cashier: "Cashier#Pass123", tailor: "Tailor#Pass123", inactive: "Inactive#Pass1" };

const users = {
  owner: { id: randomUUID(), role: "owner", email: "owner@e2e.test", name: "Owner" },
  admin: { id: randomUUID(), role: "admin", email: "admin@e2e.test", name: "Admin" },
  cashier: { id: randomUUID(), role: "cashier", email: "cashier@e2e.test", name: "Cashier" },
  tailor: { id: randomUUID(), role: "tailor", email: "tailor@e2e.test", name: "Tailor" },
  inactive: { id: randomUUID(), role: "cashier", email: "inactive@e2e.test", name: "Inactive" },
};

const variantId = randomUUID();
const templateId = randomUUID();
const RATE = 2500;

async function freePort() {
  return new Promise<number>((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe("E2E: الجلسات والصلاحيات والكاشير (next start + Supabase وهمي)", { timeout: 180_000 }, () => {
  let mock: Awaited<ReturnType<typeof startMockPostgrest>>;
  let server: ChildProcess;
  let base = "";
  let serverLog = "";
  const hashes: Record<string, string> = {};

  const state: MockState = {
    tables: {},
    requests: [],
    rpcCalls: {},
    rpcHandlers: {
      get_opening_balances_status: () => ({
        status: 200,
        body: {
          as_of: null,
          today: "2026-10-09",
          current_rate: RATE,
          cash: [],
          assets: [],
          supplier_debts: [],
          opening_stock: { entries: 0, total_usd: 0 },
          manual_capital_usd: 0,
          first_operation_at: null,
        },
      }),
      record_opening_balances: (args) => ({
        status: 200,
        body: {
          dry_run: args.p_dry_run,
          as_of: args.p_as_of,
          exchange_rate: RATE,
          entries: (args.p_cash as { account: string; currency: string; amount: number }[]).map((line) => ({
            kind: "CASH",
            label: line.account,
            debit: line.account,
            credit: "CAPITAL",
            currency: line.currency,
            amount: line.amount,
            amount_usd: line.currency === "SDG" ? line.amount / RATE : line.amount,
          })),
          capital_change_usd: 100,
        },
      }),
      complete_sales_checkout: (args) => {
        const items = args.p_items as { quantity: number; isGift: boolean }[];
        const subtotal = items.filter((i) => !i.isGift).reduce((sum, i) => sum + i.quantity * 10 * RATE, 0);
        const total = subtotal - Number(args.p_discount_amount ?? 0);
        return {
          status: 200,
          body: {
            id: randomUUID(),
            order_number: `INV-${Math.floor(Math.random() * 1e6)}`,
            subtotal,
            discount_amount: args.p_discount_amount,
            tax_amount: 0,
            total_amount: total,
            total_amount_usd: total / RATE,
            exchange_rate_used: RATE,
            paid_amount: total,
            payment_status: "PAID",
            status: "COMPLETED",
            payment_method: args.p_payment_method,
            created_at: new Date().toISOString(),
          },
        };
      },
    },
  };

  async function token(user: { id: string; email: string; name: string; role: string }, opts: { exp?: number; pwv?: string; legacy?: boolean } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = opts.legacy
      ? { userId: user.id, email: user.email, name: user.name, role: user.role, isPasswordChanged: true }
      : {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isPasswordChanged: true,
          pwv: opts.pwv ?? (await passwordFingerprint(hashes[user.email])),
          sat: now,
        };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(new TextEncoder().encode(JWT_SECRET));
  }

  const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.cookie ? { Cookie: `auth_token=${init.cookie}` } : {}),
        ...(init.body ? { "Content-Type": "application/json", Origin: base } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  before(async () => {
    assert.ok(existsSync(join(ROOT, ".next", "BUILD_ID")), "شغّل npm run build الأول");

    for (const [key, user] of Object.entries(users)) {
      hashes[user.email] = bcrypt.hashSync(PASSWORDS[key as keyof typeof PASSWORDS], 4);
    }

    state.tables.users = Object.entries(users).map(([key, user]) => ({
      ...user,
      password: hashes[user.email],
      isActive: key !== "inactive",
      isPasswordChanged: true,
      position: user.role,
      branchId: BRANCH_ID,
    }));
    state.tables.exchange_rates = [{ id: randomUUID(), branch_id: BRANCH_ID, rate: RATE, effective_at: "2026-01-01T00:00:00.000Z" }];
    state.tables.product_variants = [
      { id: variantId, templateId, sellingPrice: 10, isActive: true, template: { isActive: true } },
    ];
    state.tables.api_idempotency_keys = [];

    mock = await startMockPostgrest(state);

    const port = await freePort();
    base = `http://127.0.0.1:${port}`;

    // بيئة نظيفة: أي متغير Supabase/JWT من .env.local بيتغطى بقيم الاختبار
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(SUPABASE|NEXT_PUBLIC_SUPABASE|JWT_SECRET|APP_URL)/.test(key)) delete env[key];
    }
    Object.assign(env, {
      NODE_ENV: "production",
      SUPABASE_URL: mock.url,
      NEXT_PUBLIC_SUPABASE_URL: mock.url,
      // no publishable/anon key on purpose: the app must run with the service_role key only
      SUPABASE_SERVICE_ROLE_KEY: "e2e-service-key",
      JWT_SECRET,
      APP_URL: base,
      PORT: String(port),
    });

    server = spawn(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk) => (serverLog += chunk));
    server.stderr?.on("data", (chunk) => (serverLog += chunk));

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${base}/session-expired`);
        if (res.status === 200) return;
      } catch {
        // لسه بيقوم
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`next start did not become ready:\n${serverLog}`);
  });

  after(async () => {
    server?.kill();
    await new Promise<void>((resolve) => mock?.server.close(() => resolve()));
  });

  it("API بدون جلسة → 401 UNAUTHENTICATED (JSON عربي)", async () => {
    const res = await call("/api/products");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "UNAUTHENTICATED");
    assert.match(body.message, /تسجيل الدخول/);
  });

  it("توكن متلاعب أو منتهي أو قديم → 401 SESSION_EXPIRED ومسح الكوكي", async () => {
    const expired = await token(users.cashier, { exp: Math.floor(Date.now() / 1000) - 10 });
    const legacy = await token(users.cashier, { legacy: true });
    for (const cookie of ["garbage.token.value", expired, legacy]) {
      const res = await call("/api/products", { cookie });
      assert.equal(res.status, 401);
      assert.equal((await res.json()).code, "SESSION_EXPIRED");
      assert.match(res.headers.get("set-cookie") ?? "", /auth_token=;/);
    }
  });

  it("كلمة السر اتغيرت بعد إصدار الجلسة أو الحساب اتعطل → 401 SESSION_EXPIRED من الـ route", async () => {
    const stale = await token(users.cashier, { pwv: "old-password-fingerprint" });
    const res = await call("/api/sales/products", { cookie: stale });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, "SESSION_EXPIRED");

    const inactive = await token(users.inactive);
    const res2 = await call("/api/sales/products", { cookie: inactive });
    assert.equal(res2.status, 401);
  });

  it("جلسة سليمة لكن من غير صلاحية → 403 FORBIDDEN (مش 401)", async () => {
    const cashier = await token(users.cashier);
    for (const path of ["/api/accounting", "/api/users", "/api/purchases", "/api/reports"]) {
      const res = await call(path, { cookie: cashier });
      assert.equal(res.status, 403, path);
      assert.equal((await res.json()).code, "FORBIDDEN", path);
    }
    const tailor = await token(users.tailor);
    const res = await call(`/api/sales/${randomUUID()}`, { cookie: tailor });
    assert.equal(res.status, 403, "tailor can no longer read invoices");
  });

  it("طلب تعديل من موقع تاني (CSRF) بيترفض قبل أي معالجة", async () => {
    const cashier = await token(users.cashier);
    const res = await call("/api/sales/checkout", {
      method: "POST",
      cookie: cashier,
      body: "{}",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "CSRF_REJECTED");
  });

  it("الصفحات: بدون جلسة → الدخول، جلسة منتهية → /session-expired مع next، صلاحية ناقصة → الصفحة الرئيسية للدور", async () => {
    const anon = await call("/dashboard/pos");
    assert.equal(anon.status, 307);
    assert.equal(new URL(anon.headers.get("location")!, base).pathname, "/");

    const expired = await token(users.cashier, { exp: Math.floor(Date.now() / 1000) - 10 });
    const res = await call("/dashboard/pos?tab=1", { cookie: expired });
    assert.equal(res.status, 307);
    const location = new URL(res.headers.get("location")!, base);
    assert.equal(location.pathname, "/session-expired");
    assert.equal(location.searchParams.get("next"), "/dashboard/pos?tab=1");

    const cashier = await token(users.cashier);
    const denied = await call("/dashboard/accounting", { cookie: cashier });
    assert.equal(denied.status, 307);
    assert.equal(new URL(denied.headers.get("location")!, base).pathname, "/dashboard/pos");
  });

  it("صفحة انتهاء الجلسة: رسالة عربية وزر تسجيل الدخول بيرجع لنفس الصفحة (مسار داخلي بس)", async () => {
    const res = await call("/session-expired?next=%2Fdashboard%2Fpos");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /انتهت جلستك/);
    assert.match(html, /تسجيل الدخول مرة أخرى/);

    const evil = await call("/session-expired?next=https%3A%2F%2Fevil.example");
    assert.equal(evil.status, 200);
    const evilHtml = await evil.text();
    const hrefs = [...evilHtml.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    assert.ok(hrefs.length > 0);
    assert.ok(hrefs.every((href) => !href.includes("evil.example")), "external next never becomes a link");
  });

  it("Security headers موجودة", async () => {
    const res = await call("/session-expired");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
    const api = await call("/api/products");
    assert.match(api.headers.get("cache-control") ?? "", /no-store/);
  });

  it("تسجيل الدخول: كلمة سر غلط → 401 برسالة عامة، حساب معطل يكشف حالته بس بعد كلمة السر الصحيحة، والنجاح بيدي كوكي HttpOnly", async () => {
    const wrong = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: users.inactive.email, password: "wrong-password" }),
    });
    assert.equal(wrong.status, 401);
    assert.match((await wrong.json()).message, /غير صحيحة/);

    const inactive = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: users.inactive.email, password: PASSWORDS.inactive }),
    });
    assert.equal(inactive.status, 403);

    const ok = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: users.cashier.email, password: PASSWORDS.cashier }),
    });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    assert.match(cookie, /auth_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Max-Age=43200/);

    const issued = cookie.match(/auth_token=([^;]+)/)![1];
    const me = await call("/api/auth/me", { cookie: issued });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).email, users.cashier.email);
  });

  it("تسجيل الدخول: بعد 10 محاولات فاشلة → 429", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await call("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "nobody@e2e.test", password: `wrong-${i}-pass` }),
      });
      last = res.status;
    }
    assert.equal(last, 429);
  });

  it("طلب إعادة تعيين كلمة السر ما بيكشفش هل الحساب موجود", async () => {
    const exists = await call("/api/auth/request-reset", { method: "POST", body: JSON.stringify({ identifier: users.cashier.email }) });
    const missing = await call("/api/auth/request-reset", { method: "POST", body: JSON.stringify({ identifier: "ghost@e2e.test" }) });
    assert.equal(exists.status, 200);
    assert.equal(missing.status, 200);
    assert.equal((await exists.json()).message, (await missing.json()).message);
  });

  describe("الكاشير: إتمام البيع", () => {
    const sale = (quantity = 1, discount = 0) => {
      const unit = 10 * RATE;
      const subtotal = unit * quantity;
      return {
        orderType: "POS",
        customerId: null,
        tailorId: null,
        subtotal,
        discountAmount: discount,
        taxAmount: 0,
        totalAmount: subtotal - discount,
        paymentMethod: "CASH",
        paymentSplits: [],
        notes: null,
        exchangeRate: RATE,
        items: [
          { templateId, variantId, quantity, unitPrice: unit, unitCost: 4, totalPrice: subtotal, isGift: false, giftNote: null },
        ],
      };
    };

    it("بيانات غير صالحة → 422، وكمية سالبة → 422", async () => {
      const cashier = await token(users.cashier);
      const res = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify({ items: [] }) });
      assert.equal(res.status, 422);
      const negative = sale();
      negative.items[0].quantity = -1;
      const res2 = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(negative) });
      assert.equal(res2.status, 422);
    });

    it("مجموع مرفوع من المتصفح لتمرير خصم أكبر → 409 ومفيش بيع", async () => {
      const cashier = await token(users.cashier);
      const inflated = sale(1, 40_000);
      inflated.subtotal = 100_000;
      inflated.totalAmount = 60_000;
      inflated.items[0].unitPrice = 100_000;
      inflated.items[0].totalPrice = 100_000;
      const before = state.rpcCalls.complete_sales_checkout?.length ?? 0;
      const res = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(inflated) });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.match(body.message, /تغيّرت أسعار/);
      assert.equal(body.errors.currentPrices[variantId], 10);
      assert.equal(state.rpcCalls.complete_sales_checkout?.length ?? 0, before);
    });

    it("نفس مفتاح Idempotency-Key مرتين → بيع واحد بس والرد التاني نفس الفاتورة", async () => {
      const cashier = await token(users.cashier);
      const key = randomUUID();
      const body = JSON.stringify(sale(2));
      const before = state.rpcCalls.complete_sales_checkout?.length ?? 0;

      const first = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body, headers: { "Idempotency-Key": key } });
      assert.equal(first.status, 201);
      const firstBody = await first.json();

      const second = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body, headers: { "Idempotency-Key": key } });
      assert.equal(second.status, 201);
      const secondBody = await second.json();

      assert.equal(secondBody.orderId, firstBody.orderId);
      assert.equal(secondBody.replayed, true);
      assert.equal(state.rpcCalls.complete_sales_checkout.length, before + 1, "RPC called once");

      const reused = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(sale(3)), headers: { "Idempotency-Key": key } });
      assert.equal(reused.status, 422);
      assert.equal((await reused.json()).code, "IDEMPOTENCY_KEY_REUSED");
    });

    it("سعر صرف اتغير أثناء البيع → 409 برسالة واضحة", async () => {
      const cashier = await token(users.cashier);
      const stale = sale();
      stale.exchangeRate = 2400;
      const res = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(stale) });
      assert.equal(res.status, 409);
      assert.match((await res.json()).message, /سعر الصرف/);
    });

    it("رفض قاعدة البيانات (مثلًا نفاد المخزون) بيوصل للكاشير بالعربي وبيحرر المفتاح", async () => {
      const cashier = await token(users.cashier);
      const original = state.rpcHandlers.complete_sales_checkout;
      state.rpcHandlers.complete_sales_checkout = () => ({
        status: 400,
        body: { code: "P0001", message: "الكمية المطلوبة غير متوفرة في المخزون" },
      });
      try {
        const key = randomUUID();
        const res = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(sale()), headers: { "Idempotency-Key": key } });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).message, "الكمية المطلوبة غير متوفرة في المخزون");
        assert.equal(state.tables.api_idempotency_keys.filter((row) => String(row.key).endsWith(key)).length, 0);
      } finally {
        state.rpcHandlers.complete_sales_checkout = original;
      }
    });

    it("الكاشير مش بيشوف تفاصيل أخطاء قاعدة البيانات الداخلية", async () => {
      const cashier = await token(users.cashier);
      const original = state.rpcHandlers.complete_sales_checkout;
      state.rpcHandlers.complete_sales_checkout = () => ({
        status: 400,
        body: { code: "42703", message: 'column "secret_internal_column" does not exist' },
      });
      try {
        const res = await call("/api/sales/checkout", { method: "POST", cookie: cashier, body: JSON.stringify(sale()) });
        assert.equal(res.status, 500);
        const text = await res.text();
        assert.ok(!text.includes("secret_internal_column"));
      } finally {
        state.rpcHandlers.complete_sales_checkout = original;
      }
    });
  });

  describe("direct API authorization matrix (role × sensitive mutation)", () => {
    const id = randomUUID();
    // forbidden for cashier AND tailor (owner/admin only)
    const MANAGER_ONLY: [string, string][] = [
      ["POST", "/api/accounting/assets"],
      ["POST", "/api/accounting/exchange"],
      ["POST", "/api/accounting/manual"],
      ["POST", "/api/categories"],
      ["PUT", `/api/categories/${id}`],
      ["DELETE", `/api/categories/${id}`],
      ["POST", "/api/exchange-rates"],
      ["POST", "/api/inventory/adjustments"],
      ["POST", "/api/inventory/opening-stock"],
      ["POST", "/api/products"],
      ["PUT", `/api/products/${id}`],
      ["DELETE", `/api/products/${id}`],
      ["POST", "/api/purchases"],
      ["PATCH", `/api/purchases/${id}`],
      ["DELETE", `/api/purchases/${id}`],
      ["PATCH", `/api/purchases/${id}/status`],
      ["POST", `/api/purchases/${id}/payments`],
      ["POST", "/api/suppliers"],
      ["PUT", `/api/suppliers/${id}`],
      ["DELETE", `/api/suppliers/${id}`],
      ["POST", "/api/tailoring/commission-payments"],
      ["POST", `/api/tailoring/orders/${id}/refund`],
      ["POST", `/api/tailoring/orders/${id}/cancel`],
      ["POST", `/api/tailoring/orders/${id}/convert-to-product`],
      ["PATCH", `/api/tailoring/orders/${id}/edit`],
      ["POST", `/api/tailoring/orders/${id}/production-receive`],
      ["POST", "/api/users"],
      ["PUT", `/api/users/${id}`],
      ["DELETE", `/api/users/${id}`],
      ["POST", "/api/upload"],
    ];
    // allowed for cashier (sales.pos / tailoring.operate) but forbidden for tailor
    const NOT_FOR_TAILOR: [string, string][] = [
      ["POST", "/api/sales/checkout"],
      ["POST", "/api/sales"],
      ["POST", `/api/sales/orders/${id}/cancel`],
      ["POST", "/api/tailoring/orders"],
    ];

    const send = (method: string, path: string, cookie?: string) => call(path, { method, cookie, body: "{}" });

    it("no session → 401 on every sensitive mutation (no DB call needed)", async () => {
      for (const [method, path] of [...MANAGER_ONLY, ...NOT_FOR_TAILOR]) {
        const res = await send(method, path);
        assert.equal(res.status, 401, `${method} ${path}`);
      }
    });

    it("cashier → 403 FORBIDDEN on manager-only mutations", async () => {
      const cashier = await token(users.cashier);
      for (const [method, path] of MANAGER_ONLY) {
        const res = await send(method, path, cashier);
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.equal((await res.json()).code, "FORBIDDEN", `${method} ${path}`);
      }
    });

    it("tailor → 403 FORBIDDEN on manager-only and sales/tailoring-operate mutations", async () => {
      const tailor = await token(users.tailor);
      for (const [method, path] of [...MANAGER_ONLY, ...NOT_FOR_TAILOR]) {
        const res = await send(method, path, tailor);
        assert.equal(res.status, 403, `${method} ${path}`);
      }
    });

    it("positive control: owner passes the authorization layer on the same requests (never 401/403)", async () => {
      const owner = await token(users.owner);
      for (const [method, path] of [...MANAGER_ONLY, ...NOT_FOR_TAILOR]) {
        const res = await send(method, path, owner);
        assert.ok(![401, 403].includes(res.status), `${method} ${path} → ${res.status}`);
      }
    });
  });

  describe("opening balances (/api/accounting/opening-balances)", () => {
    const body = (dryRun: boolean) =>
      JSON.stringify({ asOf: "2026-10-09", cash: [{ account: "CASH", currency: "SDG", amount: 250000 }], dryRun });

    it("owner only: admin, cashier and tailor get 403 on read, preview and post; no session gets 401", async () => {
      assert.equal((await call("/api/accounting/opening-balances")).status, 401);
      for (const role of ["admin", "cashier", "tailor"] as const) {
        const cookie = await token(users[role]);
        assert.equal((await call("/api/accounting/opening-balances", { cookie })).status, 403, `${role} GET`);
        for (const dryRun of [true, false]) {
          const res = await call("/api/accounting/opening-balances", { method: "POST", cookie, body: body(dryRun) });
          assert.equal(res.status, 403, `${role} POST dryRun=${dryRun}`);
        }
      }
      assert.equal(state.rpcCalls.record_opening_balances?.length ?? 0, 0, "the database function was never reached");
    });

    it("owner: status, validation (422), preview and idempotent post", async () => {
      const cookie = await token(users.owner);

      const status = await call("/api/accounting/opening-balances", { cookie });
      assert.equal(status.status, 200);
      assert.equal((await status.json()).data.currentRate, RATE);

      const invalid = await call("/api/accounting/opening-balances", {
        method: "POST",
        cookie,
        body: JSON.stringify({ asOf: "yesterday", cash: [{ account: "INVENTORY", currency: "USD", amount: -1 }] }),
      });
      assert.equal(invalid.status, 422);

      const preview = await call("/api/accounting/opening-balances", { method: "POST", cookie, body: body(true) });
      assert.equal(preview.status, 200);
      const previewJson = await preview.json();
      assert.equal(previewJson.data.dryRun, true);
      assert.deepEqual(previewJson.data.entries[0], {
        kind: "CASH", label: "CASH", debit: "CASH", credit: "CAPITAL", currency: "SDG", amount: 250000, amountUsd: 100,
      });

      const key = randomUUID();
      const first = await call("/api/accounting/opening-balances", { method: "POST", cookie, body: body(false), headers: { "Idempotency-Key": key } });
      assert.equal(first.status, 201);
      const callsAfterFirst = state.rpcCalls.record_opening_balances?.length ?? 0;
      const second = await call("/api/accounting/opening-balances", { method: "POST", cookie, body: body(false), headers: { "Idempotency-Key": key } });
      assert.equal(second.status, 201);
      assert.equal(state.rpcCalls.record_opening_balances?.length ?? 0, callsAfterFirst, "retry with the same key does not post twice");
    });
  });

  it("كل طلبات قاعدة البيانات راحت للخادم الوهمي (مفيش اتصال بقاعدة العميل)", () => {
    assert.ok(state.requests.length > 0);
    assert.ok(state.requests.every((request) => request.path.startsWith("/rest/v1/")));
  });
});
