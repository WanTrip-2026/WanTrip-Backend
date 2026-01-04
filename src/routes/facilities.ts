import express, { Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("hotel_facilities")
      .select("facility_name");

    if (error) throw error;
    const uniqueFacilities = Array.from(
      new Set((data as { facility_name: string }[]).map((f) => f.facility_name))
    );
    res.json(uniqueFacilities);
  } catch (err) {
    console.error("Supabase 查詢失敗：", err);
    res.status(500).json({ message: "取得設施失敗" });
  }
});

export default router;
