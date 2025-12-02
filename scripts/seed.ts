// scripts/seed.ts (robust - uses admin.listUsers as fallback)
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.server" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.server");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// helper to extract id from various createUser responses
function extractUserId(resp: any) {
  if (!resp) return null;
  if (resp?.data?.user?.id) return resp.data.user.id;
  if (resp?.user?.id) return resp.user.id;
  if (resp?.data?.id) return resp.data.id;
  if (resp?.id) return resp.id;
  return null;
}

// fallback: use admin.listUsers to find user by email
async function findUserIdByListing(email: string) {
  try {
    // call listUsers (may return { data: { users: [...] } } or { data: [...users] } depending on SDK)
    // Use any to avoid TS errors for different SDK versions
    // @ts-ignore
    const listResp = await (supabaseAdmin.auth.admin as any).listUsers?.();

    if (!listResp) {
      console.warn("admin.listUsers not available in this SDK version.");
      return null;
    }

    // new SDK shape: { data: { users: [...] } }
    const usersArr = listResp?.data?.users ?? listResp?.data ?? listResp?.users ?? listResp;
    if (!usersArr || !Array.isArray(usersArr)) {
      console.warn("listUsers returned unexpected shape:", JSON.stringify(listResp).slice(0, 200));
      return null;
    }

    const found = usersArr.find((u: any) => String(u?.email).toLowerCase() === email.toLowerCase());
    if (found) return found.id;

    // If not found in first page, try to page through (if the SDK exposes pagination)
    // Some SDKs accept { page, per_page } or { next } tokens — but that varies.
    // We'll attempt a simple loop if listResp has `data` and `meta` / `next` style (best-effort).
    // If not present, return null.
    return null;
  } catch (err) {
    console.warn("listUsers fallback failed:", err);
    return null;
  }
}

async function createOrGetUser(email: string, password: string) {
  try {
    // createUser via admin API
    // @ts-ignore - admin.createUser exists on service role client
    const resp = await (supabaseAdmin.auth.admin as any).createUser({
      email,
      password,
      email_confirm: true,
    });

    console.log("DEBUG createUser response:", JSON.stringify(resp, null, 2));
    const id = extractUserId(resp);
    if (id) return id;

    // if create failed with email_exists, try listUsers fallback
    if (resp?.error?.code === "email_exists" || resp?.error?.status === 422) {
      console.log(`User ${email} already exists — trying admin.listUsers fallback.`);
      const fid = await findUserIdByListing(email);
      if (fid) return fid;
    }

    // If resp had an error but not email_exists, still try to find by listing
    if (resp?.error) {
      console.log("createUser returned error; trying admin.listUsers to find user anyway.");
      const fid = await findUserIdByListing(email);
      if (fid) return fid;
    }
  } catch (err) {
    console.warn("createUser threw an error; attempting to find user by admin.listUsers. Error:", err);
    const fid = await findUserIdByListing(email);
    if (fid) return fid;
  }

  return null;
}

async function seed() {
  try {
    console.log("Seeding database...");

    const pwd = "Pass1234!";

    const aliceId = await createOrGetUser("alice@example.com", pwd);
    const bobId = await createOrGetUser("bob@example.com", pwd);

    console.log("Users created / fetched:", { aliceId, bobId });

    if (!aliceId || !bobId) {
      console.error("Could not create or find both users. Aborting seed. Inspect DEBUG logs above.");
      process.exit(1);
    }

    // create or reuse conversation
    let conversationId: string | null = null;
    try {
      const { data: existing } = await supabaseAdmin.from("conversations").select("id").limit(1).maybeSingle();
      if (existing?.id) {
        conversationId = existing.id;
        console.log("Reusing existing conversation:", conversationId);
      }
    } catch (e) {
      // ignore
    }

    if (!conversationId) {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({ name: null })
        .select("id")
        .maybeSingle();
      if (convErr) throw convErr;
      conversationId = conv.id;
      console.log("Conversation created:", conversationId);
    }

    // participants
    const { data: currentParticipants } = await supabaseAdmin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const presentIds = (currentParticipants || []).map((p: any) => p.user_id);
    const toInsert: any[] = [];
    if (!presentIds.includes(aliceId)) toInsert.push({ conversation_id: conversationId, user_id: aliceId });
    if (!presentIds.includes(bobId)) toInsert.push({ conversation_id: conversationId, user_id: bobId });

    if (toInsert.length > 0) {
      const { error: cpErr } = await supabaseAdmin.from("conversation_participants").insert(toInsert);
      if (cpErr) throw cpErr;
      console.log("Participants added.");
    } else {
      console.log("Participants already present; skipping insert.");
    }

    // messages (only if none)
    const { data: msgs } = await supabaseAdmin.from("messages").select("id").eq("conversation_id", conversationId).limit(1);
    if (!msgs || msgs.length === 0) {
      const { error: msgErr } = await supabaseAdmin.from("messages").insert([
        { conversation_id: conversationId, sender_id: aliceId, content: "Seed: Hi Bob!" },
        { conversation_id: conversationId, sender_id: bobId, content: "Seed: Hi Alice!" },
      ]);
      if (msgErr) throw msgErr;
      console.log("Messages inserted!");
    } else {
      console.log("Messages already exist; skipping.");
    }

    console.log("✔ Seed complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
