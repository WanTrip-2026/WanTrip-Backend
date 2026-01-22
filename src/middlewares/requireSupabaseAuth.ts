import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../services/supabaseAdmin.js";

export async function requireSupabaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing Bearer token" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  // 把 user 塞進 req 方便後續 route 使用
  (req as any).user = data.user;
  (req as any).accessToken = token;

  next();
}
