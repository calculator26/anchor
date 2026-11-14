// Anchor · admin-users — account actions that need the service-role key.
// Every call is authenticated from the caller's own JWT and authorised against
// public.profiles: admins can act on anyone; tutors only create / manage their
// own students. The service key never leaves this function.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const validEmail = (e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const validPassword = (p: unknown) => typeof p === "string" && p.length >= 8 && p.length <= 72;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Not signed in" }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: "Not signed in" }, 401);
  const caller = who.user;

  const { data: me } = await admin.from("profiles").select("role").eq("user_id", caller.id).maybeSingle();
  const isAdmin = me?.role === "admin";
  const isTutor = isAdmin || me?.role === "tutor";
  if (!isTutor) return json({ error: "Not allowed" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const action = String(body.action || "");

  async function target(id: unknown) {
    if (typeof id !== "string") return null;
    const { data } = await admin.from("profiles").select("user_id, email, role, tutor_id").eq("user_id", id).maybeSingle();
    return data;
  }
  async function canManage(id: unknown) {
    const t = await target(id);
    if (!t) return null;
    if (isAdmin) return t;
    return t.tutor_id === caller.id ? t : null;
  }
  async function audit(targetId: string | null, act: string, detail: Record<string, unknown> = {}) {
    await admin.from("admin_audit").insert({ actor: caller.id, target: targetId, action: act, detail });
  }

  try {
    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = body.password;
      const display = String(body.display_name || "").trim().slice(0, 60);
      const role = body.role === "user" && isAdmin ? "user" : body.role === "tutor" && isAdmin ? "tutor" : "student";
      if (!validEmail(email)) return json({ error: "Enter a valid email" }, 400);
      if (!validPassword(password)) return json({ error: "Password must be 8–72 characters" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email, password: password as string, email_confirm: true, user_metadata: { display_name: display },
      });
      if (error) return json({ error: error.message }, 400);
      const uid = data.user!.id;
      await admin.from("profiles").upsert({
        user_id: uid, email, display_name: display, role,
        tutor_id: role === "student" ? caller.id : null,
        year_level: String(body.year_level || "").slice(0, 30),
      });
      await audit(uid, "user.create", { email, role });
      return json({ ok: true, user_id: uid });
    }

    if (action === "set_password") {
      const t = await canManage(body.user_id);
      if (!t) return json({ error: "Not allowed" }, 403);
      if (t.role === "admin" && t.user_id !== caller.id) return json({ error: "Not allowed" }, 403);
      if (!validPassword(body.password)) return json({ error: "Password must be 8–72 characters" }, 400);
      const { error } = await admin.auth.admin.updateUserById(t.user_id, { password: body.password as string });
      if (error) return json({ error: error.message }, 400);
      await audit(t.user_id, "user.set_password");
      return json({ ok: true });
    }

    if (action === "send_reset") {
      const t = await canManage(body.user_id);
      if (!t) return json({ error: "Not allowed" }, 403);
      const redirectTo = typeof body.redirect === "string" ? body.redirect : undefined;
      const { error } = await admin.auth.resetPasswordForEmail(t.email, { redirectTo });
      if (error) return json({ error: error.message }, 400);
      await audit(t.user_id, "user.send_reset");
      return json({ ok: true });
    }

    if (action === "set_email") {
      if (!isAdmin) return json({ error: "Admin only" }, 403);
      const t = await target(body.user_id);
      const email = String(body.email || "").trim().toLowerCase();
      if (!t) return json({ error: "No such user" }, 404);
      if (!validEmail(email)) return json({ error: "Enter a valid email" }, 400);
      const { error } = await admin.auth.admin.updateUserById(t.user_id, { email, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      await audit(t.user_id, "user.set_email", { from: t.email, to: email });
      return json({ ok: true });
    }

    if (action === "delete") {
      if (!isAdmin) return json({ error: "Admin only" }, 403);
      const t = await target(body.user_id);
      if (!t) return json({ error: "No such user" }, 404);
      if (t.role === "admin") return json({ error: "Admins can't be deleted here" }, 403);
      if (String(body.confirm_email || "").toLowerCase() !== t.email.toLowerCase()) {
        return json({ error: "Confirmation email doesn't match" }, 400);
      }
      // keep a final copy of their data in the audit trail before the cascade removes it
      const { data: doc } = await admin.from("anchor_data").select("data").eq("user_id", t.user_id).maybeSingle();
      await audit(t.user_id, "user.delete", { email: t.email, final_doc: doc?.data ?? null });
      const { error } = await admin.auth.admin.deleteUser(t.user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "auth_info") {
      const t = await canManage(body.user_id);
      if (!t) return json({ error: "Not allowed" }, 403);
      const { data, error } = await admin.auth.admin.getUserById(t.user_id);
      if (error) return json({ error: error.message }, 400);
      const u = data.user;
      return json({ ok: true, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
                    confirmed: !!u.email_confirmed_at, banned_until: (u as { banned_until?: string }).banned_until ?? null });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || "Server error" }, 500);
  }
});
