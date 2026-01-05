import express, { Request, Response } from "express";
import { supabase } from "../supabase";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("profiles").select("*");

  if (error) {
    console.error("Supabase 查詢失敗：", error);
    return res.status(500).json({ message: "取得會員資料失敗" });
  }

  res.json(data);
});

export default router;
