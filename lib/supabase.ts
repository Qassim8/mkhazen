import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("بيانات Supabase العامة مفقودة");
}

if (!supabaseServiceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY مفقود");
}

// العميل العادي
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// عميل الأدمن - Server Only
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
