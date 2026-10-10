import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations/auth.schemas";
import { createSession, isAccountActive } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { MESSAGES } from "@/lib/api-codes";
import { apiError, readJson } from "@/lib/api-response";
import { checkRateLimit, clientIp, resetRateLimit } from "@/lib/rate-limit";

const INVALID_CREDENTIALS = "البريد الإلكتروني أو كلمة المرور غير صحيحة";

// هاش وهمي: لو المستخدم مش موجود بنعمل نفس مقارنة bcrypt عشان زمن الرد
// ما يكشفش هل البريد مسجل ولا لأ
// (هاش لنص عشوائي محدش يعرفه)
const DUMMY_HASH = "$2b$10$5HZXD2OFq7lWodZZUV2FHeIK9ag2Lgs1IgGFyBS9dS8ModaIXe4tG";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return apiError(400, "VALIDATION_ERROR", validation.error.issues[0].message);
    }

    const email = validation.data.email.trim();
    const { password } = validation.data;

    // 10 محاولات كل 15 دقيقة لنفس (IP + البريد)
    const limiterKey = `login:${clientIp(req)}:${email.toLowerCase()}`;
    const limit = checkRateLimit(limiterKey, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { message: MESSAGES.RATE_LIMITED, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    // البحث عن الموظف/المستخدم في Supabase
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select('id, name, email, role, position, password, "isActive", "isPasswordChanged"')
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("Login lookup error:", error);
      return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
    }

    // مطابقة كلمة المرور المشفّرة (قبل أي فحص تاني عشان ما نكشفش حالة الحساب)
    const isPasswordValid = await bcrypt.compare(
      password,
      typeof user?.password === "string" && user.password ? user.password : DUMMY_HASH,
    );

    if (!user || !isPasswordValid) {
      return apiError(401, "UNAUTHENTICATED", INVALID_CREDENTIALS);
    }

    // التأكد من أن الحساب نشط (بعد التحقق من كلمة السر)
    if (!isAccountActive(user.isActive)) {
      return apiError(403, "FORBIDDEN", "هذا الحساب غير نشط، يرجى مراجعة الإدارة");
    }

    resetRateLimit(limiterKey);

    // حفظ الجلسة
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isPasswordChanged: Boolean(user.isPasswordChanged),
      passwordHash: user.password,
    });

    return NextResponse.json(
      {
        message: "تم تسجيل الدخول بنجاح",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          position: user.position,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    console.error("Login Error:", err);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء تسجيل الدخول");
  }
}
