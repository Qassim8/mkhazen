import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The application talks to Supabase ONLY from the server, with the
 * service_role key. After database/migrations/20261010_01 the anon and
 * authenticated roles have no privileges in schema public, so a client built
 * with the publishable/anon key could not read or call anything — there is
 * intentionally no such client here (enforced by tests/unit/db-access.test.ts).
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL مفقود");
}

if (!supabaseServiceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY مفقود");
}

// عميل الأدمن - Server Only
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
