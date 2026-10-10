/**
 * lib/rate-limit.ts — حد بسيط لعدد المحاولات (في ذاكرة السيرفر)
 *
 * ⚠️ على Vercel كل instance ليه ذاكرته، فده حماية جزئية ضد التخمين
 * المتكرر من نفس المصدر، مش بديل عن WAF / Rate limiting على مستوى المنصة.
 * (موثق في docs/production-audit.md)
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** IP العميل (Vercel بيحط x-forwarded-for) */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
