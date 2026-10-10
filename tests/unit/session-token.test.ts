import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { SignJWT } from "jose";

import {
  REFRESH_AFTER_SECONDS,
  passwordFingerprint,
  refreshSessionTokenIfNeeded,
  sessionIdleSeconds,
  sessionMaxSeconds,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session-token";

const user = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "cashier@example.test",
  name: "Cashier",
  role: "cashier",
  isPasswordChanged: true,
};

describe("session token", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret-unit-test-secret-1234";
    delete process.env.SESSION_IDLE_HOURS;
    delete process.env.SESSION_MAX_DAYS;
  });

  it("توكن صالح يتقبل ويحمل بصمة كلمة السر ووقت بدء الجلسة", async () => {
    const pwv = await passwordFingerprint("$2b$10$hash");
    const now = 1_800_000_000;
    const { token, maxAge } = await signSessionToken({ ...user, pwv }, now);

    assert.equal(maxAge, sessionIdleSeconds());
    const result = await verifySessionToken(token, now + 60);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.claims.userId, user.userId);
      assert.equal(result.claims.pwv, pwv);
      assert.equal(result.claims.sat, now);
    }
  });

  it("مهلة الخمول الافتراضية 12 ساعة والحد الأقصى 7 أيام (وقابلين للضبط)", () => {
    assert.equal(sessionIdleSeconds(), 12 * 3600);
    assert.equal(sessionMaxSeconds(), 7 * 86400);
    process.env.SESSION_IDLE_HOURS = "8";
    process.env.SESSION_MAX_DAYS = "1";
    assert.equal(sessionIdleSeconds(), 8 * 3600);
    assert.equal(sessionMaxSeconds(), 86400);
    process.env.SESSION_IDLE_HOURS = "abc";
    assert.equal(sessionIdleSeconds(), 12 * 3600);
  });

  it("التوكن المنتهي = expired، والمفقود = missing، والمتلاعب به = invalid", async () => {
    const now = 1_800_000_000;
    const { token } = await signSessionToken({ ...user, pwv: "x" }, now);

    assert.deepEqual(await verifySessionToken(token, now + sessionIdleSeconds() + 1), {
      ok: false,
      reason: "expired",
    });
    assert.deepEqual(await verifySessionToken(undefined), { ok: false, reason: "missing" });
    assert.deepEqual(await verifySessionToken(""), { ok: false, reason: "missing" });

    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "owner" }),
    ).toString("base64url");
    assert.deepEqual(await verifySessionToken(`${header}.${forgedPayload}.${signature}`, now), {
      ok: false,
      reason: "invalid",
    });
  });

  it("توكن موقّع بمفتاح تاني أو بخوارزمية none بيترفض", async () => {
    const now = Math.floor(Date.now() / 1000);
    const other = await new SignJWT({ ...user, pwv: "x", sat: now })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode("another-secret-another-secret-123456"));
    assert.equal((await verifySessionToken(other)).ok, false);

    const unsigned =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ ...user, pwv: "x", sat: now, exp: now + 3600 })).toString("base64url") +
      ".";
    assert.equal((await verifySessionToken(unsigned)).ok, false);
  });

  it("توكن قديم (قبل التحديث) من غير pwv/sat بيعتبر منتهي → المستخدم يسجل دخول من جديد", async () => {
    const now = Math.floor(Date.now() / 1000);
    const legacy = await new SignJWT({ ...user })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 7 * 86400)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.deepEqual(await verifySessionToken(legacy), { ok: false, reason: "expired" });
  });

  it("الحد الأقصى المطلق بيتطبق حتى لو التوكن اتجدد", async () => {
    const start = 1_800_000_000;
    const nearEnd = start + sessionMaxSeconds() - 60;
    const { token, maxAge } = await signSessionToken({ ...user, pwv: "x", sat: start }, nearEnd);
    assert.equal(maxAge, 60, "exp is capped at the absolute session end");
    assert.equal((await verifySessionToken(token, nearEnd + 30)).ok, true);
    assert.deepEqual(await verifySessionToken(token, start + sessionMaxSeconds() + 1), {
      ok: false,
      reason: "expired",
    });
  });

  it("التجديد التلقائي بيحصل بس بعد 15 دقيقة وبيحافظ على sat و pwv", async () => {
    const now = 1_800_000_000;
    const { token } = await signSessionToken({ ...user, pwv: "pw" }, now);
    const verified = await verifySessionToken(token, now + 10);
    assert.ok(verified.ok);
    if (!verified.ok) return;

    assert.equal(await refreshSessionTokenIfNeeded(verified.claims, now + 60), null);

    const later = now + REFRESH_AFTER_SECONDS + 1;
    const refreshed = await refreshSessionTokenIfNeeded(verified.claims, later);
    assert.ok(refreshed);
    const again = await verifySessionToken(refreshed!.token, later + sessionIdleSeconds() - 10);
    assert.ok(again.ok, "refreshed token extends the idle window");
    if (again.ok) {
      assert.equal(again.claims.sat, now);
      assert.equal(again.claims.pwv, "pw");
    }
  });

  it("بصمة كلمة السر بتتغير لما الهاش يتغير ومش بتكشف الهاش", async () => {
    const a = await passwordFingerprint("$2b$10$aaaa");
    const b = await passwordFingerprint("$2b$10$bbbb");
    assert.notEqual(a, b);
    assert.equal(a, await passwordFingerprint("$2b$10$aaaa"));
    assert.ok(!a.includes("aaaa"));
    assert.match(a, /^[A-Za-z0-9_-]{20,24}$/);
  });
});
