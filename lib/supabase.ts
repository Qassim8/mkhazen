// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// المفتاح السري الخاص بالسيرفر (لا يظهر للفرونت إند أبداً)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("بيانات Supabase مفقودة من ملف .env.local");
}

// 1. العميل العادي (يحترم سياسات RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. عميل الأدمن (يتخطى RLS بأمان داخل السيرفر فقط)
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey,
);
