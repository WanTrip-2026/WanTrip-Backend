import { Router } from "express";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "../../services/supabaseAdmin";

const router = Router();

console.log("[authRouter] loaded");

function setSessionCookie(
  res: any,
  payload: { sub: string; email?: string | null },
) {
  const cookieName = process.env.COOKIE_NAME || "wantrip_session";
  const token = jwt.sign(payload, process.env.APP_JWT_SECRET!, {
    expiresIn: "7d",
  });

  const isProd = process.env.NODE_ENV === "production";
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

router.get("/cors-test", (_req, res) => {
  res.json({ ok: true });
});

/**
 * POST /api/auth/session
 * body: { access_token }
 */
const createSessionHandler = async (req: any, res: any) => {
  try {
    const { access_token } = req.body ?? {};
    if (!access_token)
      return res.status(400).json({ message: "access_token required" });

    const { data, error } = await supabaseAdmin.auth.getUser(access_token);
    if (error) return res.status(401).json({ message: error.message });

    const user = data.user;
    if (!user) return res.status(401).json({ message: "Invalid token" });

    const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: (user.user_metadata as any)?.full_name || "",
      },
      { onConflict: "id" },
    );

    if (upsertErr) return res.status(500).json({ message: upsertErr.message });

    setSessionCookie(res, { sub: user.id, email: user.email });

    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e: any) {
    console.error("[auth/session] error:", e);
    return res.status(500).json({ message: e?.message || "Server error" });
  }
};

router.post("/session", async (req, res) => {
  try {
    const { access_token } = req.body ?? {};
    if (!access_token)
      return res.status(400).json({ message: "access_token required" });

    const { data, error } = await supabaseAdmin.auth.getUser(access_token);
    if (error) return res.status(401).json({ message: error.message });

    const user = data.user;
    if (!user) return res.status(401).json({ message: "Invalid token" });

    // 登入後的資料插入/更新邏輯
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone, gender, birthday, email")
      .eq("id", user.id)
      .maybeSingle();

    // 如果資料庫中沒有找到使用者資料，使用 upsert 插入資料
    if (!profile) {
      const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata.full_name || "",
      });
      if (upsertErr) {
        return res.status(500).json({ message: upsertErr.message });
      }
    }

    // 設置 session cookie
    setSessionCookie(res, { sub: user.id, email: user.email });

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (e) {
    console.error("[auth/session] error:", e);
    return res
      .status(500)
      .json({ message: (e as any)?.message || "Server error" });
  }
});

router.post("/exchange", createSessionHandler);

router.post("/logout", async (_req, res) => {
  const cookieName = process.env.COOKIE_NAME || "wantrip_session";
  res.clearCookie(cookieName, { path: "/" });
  return res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const cookieName = process.env.COOKIE_NAME || "wantrip_session";
  const token = req.cookies?.[cookieName] || null;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized, no token provided" });
  }

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any;
    const userId = payload.sub;

    // 這裡選擇了返回更多資料，包含 email
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone, gender, birthday, email") // 這裡加入 email
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[auth/me] profile not found:", error.message);
      return res.status(401).json({ message: "資料庫查詢錯誤" });
    }

    return res.json({
      user: {
        id: userId,
        email: profile?.email ?? payload.email, // 如果資料庫沒有 email，回傳 payload.email
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        gender: profile?.gender ?? null,
        birthday: profile?.birthday ?? null,
      },
    });
  } catch (e) {
    console.error("[auth/me] Error verifying token:", e);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

export default router;
