import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase.js";

const router = Router();

// 取得全部飯店圖片
router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("hotel_images").select("*");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("GET /hotel_images error:", err);
    res.status(500).json({ error: "取得飯店圖片失敗" });
  }
});

// 依飯店 ID 取得圖片
router.get("/:hotelId", async (req: Request, res: Response) => {
  const { hotelId } = req.params;

  try {
    const { data, error } = await supabase
      .from("hotel_images")
      .select("*")
      .eq("hotel_id", hotelId);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "找不到該飯店圖片" });
    }

    res.json(data);
  } catch (err) {
    console.error(`GET /hotel_images/${hotelId} error:`, err);
    res.status(500).json({ error: "取得飯店圖片失敗" });
  }
});

export default router;
