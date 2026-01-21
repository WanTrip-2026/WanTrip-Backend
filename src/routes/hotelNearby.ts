import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase.js";

const router = Router();

// 首頁附近飯店（預設 6 筆）
router.get("/", async (req: Request, res: Response) => {
  try {
    const city = typeof req.query.city === "string" ? req.query.city : "台北市";
    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string) || 6, 1),
      12,
    );

    let q = supabase
      .from("hotels_with_cover_v")
      .select(
        "id,name,city,district,address,star_rating,min_price,cover_image_url",
      )
      .eq("city", city)
      .order("min_price", { ascending: true })
      .limit(limit);

    const { data, error } = await q;

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "取得附近飯店失敗" });
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "取得附近飯店失敗" });
  }
});

export default router;
