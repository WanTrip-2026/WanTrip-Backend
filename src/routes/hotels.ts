import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    // 1. 取得並解析前端參數
    const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
    const startDate = (req.query.start_date as string) || null;
    const endDate = (req.query.end_date as string) || null;
    const totalPeople = parseInt(req.query.adults as string, 10) || 0;
    const roomsRequired = parseInt(req.query.rooms as string, 10) || 0;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);

    // 處理星等數組
    const starRatings = req.query.star_ratings
      ? (req.query.star_ratings as string)
          .split(",")
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n))
      : [];

    console.log("--- 執行 RPC 搜尋 ---");

    // 2. 呼叫 Supabase RPC (在 SQL Editor 建立的函數)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "search_hotels",
      {
        p_keyword: keyword,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_adults: totalPeople,
        p_rooms: roomsRequired,
        p_star_ratings: starRatings,
        p_page: page,
        p_limit: limit,
      }
    );

    if (rpcError) {
      console.error("RPC 執行失敗:", rpcError);
      throw rpcError;
    }

    // 從 RPC 結果中取得總數 (取第一筆資料的 total_count )
    const totalCount =
      rpcData && rpcData.length > 0 ? parseInt(rpcData[0].total_count) : 0;
    // 提取這一頁的所有飯店 ID
    const hotelIds = (rpcData ?? []).map((r: any) => r.hotel_id);

    console.log(`RPC 回傳飯店數: ${hotelIds.length}, 符合總數: ${totalCount}`);

    if (hotelIds.length === 0) {
      return res.json({ total: 0, page, limit, hotels: [] });
    }

    // 3. 根據分頁後的 ID 批量抓取詳細資料 (保持原有的 Step F 邏輯)
    const [hotelsRes, typesRes, facilitiesRes, imagesRes] = await Promise.all([
      supabase.from("hotels").select("*").in("id", hotelIds),
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
    const hotels = (hotelsRes.data ?? []).map((h: any) => {
      const featureImage = (imagesRes.data ?? [])
        .filter((img) => img.hotel_id === h.id)
        .sort(
          (a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
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

    // 保持與原來的排序一致
    const sortedHotels = hotelIds
      .map((id: string) => hotels.find((h) => h.id === id))
      .filter(Boolean);

    console.log("--- 搜尋完成 ---");
    return res.json({ total: totalCount, page, limit, hotels: sortedHotels });
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
