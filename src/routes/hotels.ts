import express, { Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

// 取得飯店清單，可篩選設施
router.get("/", async (req: Request, res: Response) => {
  try {
    const facilityNames = req.query.facilities as string | undefined; // 例如 "游泳池,SPA服務"

    // 先抓所有飯店 + facilities
    let query = supabase
      .from("hotel_facilities")
      .select("hotel_id, facility_name");

    const { data: facilitiesData, error: facilitiesError } = await query;
    if (facilitiesError) throw facilitiesError;

    const { data: hotelsData, error: hotelsError } = await supabase
      .from("hotels")
      .select("*");

    if (hotelsError) throw hotelsError;

    // 轉成 map：hotel_id => [facilities]
    const hotelFacilitiesMap =
      facilitiesData?.reduce((acc: any, f) => {
        if (!acc[f.hotel_id]) acc[f.hotel_id] = [];
        acc[f.hotel_id].push(f.facility_name);
        return acc;
      }, {} as Record<string, string[]>) ?? {};

    // 加上 facilities 陣列到每間飯店
    let hotels =
      hotelsData?.map((h) => ({
        ...h,
        facilities: hotelFacilitiesMap[h.id] ?? [],
      })) ?? [];

    // 篩選勾選的設施
    if (facilityNames) {
      const selected = facilityNames.split(",");
      hotels = hotels.filter((h) =>
        selected.every((f) => h.facilities.includes(f))
      );
    }

    res.json(hotels);
  } catch (err) {
    console.error("取得飯店資料失敗：", err);
    res.status(500).json({ message: "取得飯店資料失敗" });
  }
});

// 取得單一飯店
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
