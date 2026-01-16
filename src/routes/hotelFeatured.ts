import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("featured_hotels_v")
      .select("*")
      .order("featured_order", { ascending: true, nullsFirst: false })
      .limit(12);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "取得熱門飯店失敗" });
    }

    res.json(data ?? []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "取得熱門飯店失敗" });
  }
});

export default router;
