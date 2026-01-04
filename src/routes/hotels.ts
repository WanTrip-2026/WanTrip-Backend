import express, { Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("hotels").select("*");

  if (error) {
    console.error("Supabase 查詢失敗：", error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("取得單一飯店資料失敗：", error);
    return res.status(404).json({ error: "找不到該飯店" });
  }

  res.json(data);
});

export default router;
