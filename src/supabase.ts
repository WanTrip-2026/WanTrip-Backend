import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "環境變數缺失：請確認 .env 裡有設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY"
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  serviceRoleKey
);
export default supabase;
