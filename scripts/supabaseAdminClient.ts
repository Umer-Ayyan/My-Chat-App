// scripts/supabaseAdminClient.ts
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env" }); // or just .env.server

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.server");
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceRole, {
  auth: { persistSession: false }
});

module.exports = { supabaseAdmin };
