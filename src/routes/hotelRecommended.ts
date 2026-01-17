import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string, 10) || 6, 1),
      20
    );

    const { data, error } = await supabase
      .from("hotels_with_cover_v")
      .select(
        "id,name,city,district,address,star_rating,min_price,cover_image_url"
      )
      .eq("star_rating", 5)
      .order("min_price", { ascending: true })
      .limit(limit);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "取得推薦飯店失敗" });
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "取得推薦飯店失敗" });
  }
});

export default router;
