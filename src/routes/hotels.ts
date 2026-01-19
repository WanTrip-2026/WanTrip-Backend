import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    // 1. 取得並解析前端參數
    const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);

    // 處理星等數組
    const starRatings = req.query.star_ratings
      ? (req.query.star_ratings as string)
          .split(",")
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n))
      : [];

    console.log("--- 執行 Direct Query 搜尋 ---");

    // 2. 直接查詢 hotels table
    let query = supabase.from("hotels").select("*", { count: "exact" });

    // 關鍵字搜尋 (名稱、城市、區域)
    if (keyword) {
      query = query.or(
        `name.ilike.%${keyword}%,city.ilike.%${keyword}%,district.ilike.%${keyword}%`,
      );
    }

    // 星級篩選
    if (starRatings.length > 0) {
      query = query.in("star_rating", starRatings);
    }

    // 分頁
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: hotelsData, error: hotelsError, count } = await query;

    if (hotelsError) {
      console.error("Query 執行失敗:", hotelsError);
      throw hotelsError;
    }

    const totalCount = count || 0;
    const hotelIds = (hotelsData ?? []).map((h) => h.id);

    console.log(
      `Query 回傳飯店數: ${hotelIds.length}, 符合總數: ${totalCount}`,
    );

    if (hotelIds.length === 0) {
      return res.json({ total: 0, page, limit, hotels: [] });
    }

    // 3. 根據分頁後的 ID 批量抓取詳細資料
    const [typesRes, facilitiesRes, imagesRes] = await Promise.all([
      supabase
        .from("hotel_types")
        .select("hotel_id, type")
        .in("hotel_id", hotelIds),
      supabase
        .from("hotel_facilities")
        .select("hotel_id, facility_name")
        .in("hotel_id", hotelIds),
      supabase
        .from("hotel_images")
        .select("hotel_id, image_url, sort_order")
        .in("hotel_id", hotelIds),
    ]);

    // 4. 組合資料
    const hotels = (hotelsData ?? []).map((h: any) => {
      const featureImage = (imagesRes.data ?? [])
        .filter((img) => img.hotel_id === h.id)
        .sort(
          (a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999),
        )[0]?.image_url;

      return {
        ...h,
        types: (typesRes.data ?? [])
          .filter((t) => t.hotel_id === h.id)
          .map((t) => t.type),
        facilities: (facilitiesRes.data ?? [])
          .filter((f) => f.hotel_id === h.id)
          .map((f) => f.facility_name),
        image_url:
          featureImage ||
          "https://res.cloudinary.com/wantrip/image/upload/v1767939338/%E9%A3%AF%E5%BA%97%E9%A6%96%E5%9C%96_dualwy.jpg",
      };
    });

    console.log("--- 搜尋完成 ---");
    return res.json({ total: totalCount, page, limit, hotels });
  } catch (err: any) {
    console.error("❌ 搜尋失敗：", err.message);
    return res
      .status(500)
      .json({ message: "取得飯店資料失敗", detail: err.message });
  }
});

// 1. 取得飯店詳細資料
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("hotels")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: "取得詳情失敗", detail: err.message });
  }
});

// 2. 取得該飯店的所有房型
router.get("/:id/rooms", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("hotel_id", id);

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: "取得房型失敗", detail: err.message });
  }
});

export default router;
