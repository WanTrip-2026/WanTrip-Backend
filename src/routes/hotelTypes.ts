import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase.js";

const router = Router();

// 取得所有住宿類型（給前端篩選用）
router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("hotel_types").select("type");

    if (error) throw error;

    // 去重複
    const types = Array.from(
      new Set((data ?? []).map((r: { type: string }) => r.type)),
    ).sort();

    res.json(types);
  } catch (err: any) {
    console.error("取得住宿類型失敗：", err.message || err);
    res.status(500).json({ message: "取得住宿類型失敗" });
  }
});

export default router;
