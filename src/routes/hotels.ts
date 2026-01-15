import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

// --- 1. 取得飯店列表 (主搜尋功能) ---
router.get("/", async (req: Request, res: Response) => {
  const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
  const startDate = req.query.start_date as string;
  const endDate = req.query.end_date as string;
  const adults = parseInt(req.query.adults as string, 10) || 2;
  const roomsRequired = parseInt(req.query.rooms as string, 10) || 1;

  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);
    const offset = (page - 1) * limit;

    const facilityNames =
      (req.query.facility_names as string | undefined)?.trim() ?? "";
    const starRatingsRaw = (req.query.star_ratings as string | undefined) ?? "";
    const typesRaw = (req.query.types as string | undefined)?.trim() ?? "";

    // 篩選器容器
    let filterSets: string[][] = [];

    // A. 日期與庫存篩選
    if (startDate && endDate) {
      const { data: availableData } = await supabase
        .from("room_inventory")
        .select("room_id")
        .gte("date", startDate)
        .lt("date", endDate)
        .gt("available_quantity", 0);

      const roomIds = (availableData ?? []).map((r) => r.room_id);
      if (roomIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });

      const { data: roomsData } = await supabase
        .from("rooms")
        .select("hotel_id")
        .in("id", roomIds)
        .gte("capacity", Math.ceil(adults / roomsRequired));

      const dateHotelIds = Array.from(
        new Set((roomsData ?? []).map((r) => r.hotel_id))
      );
      if (dateHotelIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
      filterSets.push(dateHotelIds);
    }

    // B. 設施篩選 (AND 邏輯)
    if (facilityNames) {
      const selected = facilityNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { data: hfData } = await supabase
        .from("hotel_facilities")
        .select("hotel_id, facility_name")
        .in("facility_name", selected);

      const hitMap = new Map<string, Set<string>>();
      (hfData ?? []).forEach((row: any) => {
        if (!hitMap.has(row.hotel_id)) hitMap.set(row.hotel_id, new Set());
        hitMap.get(row.hotel_id)!.add(row.facility_name);
      });

      const facilityHotelIds = Array.from(hitMap.entries())
        .filter(([_, fSet]) => selected.every((f) => fSet.has(f)))
        .map(([id]) => id);

      if (facilityHotelIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
      filterSets.push(facilityHotelIds);
    }

    // C. 類型篩選 (OR 邏輯)
    if (typesRaw) {
      const types = typesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { data: htData } = await supabase
        .from("hotel_types")
        .select("hotel_id")
        .in("type", types);
      const typeHotelIds = Array.from(
        new Set((htData ?? []).map((r: any) => r.hotel_id))
      );
      if (typeHotelIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
      filterSets.push(typeHotelIds);
    }

    // D. 計算最終交集 ID
    let finalIds: string[] | null = null;
    if (filterSets.length > 0) {
      finalIds = filterSets.reduce((a, b) => a.filter((c) => b.includes(c)));
      if (finalIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
    }

    // E. 執行基礎查詢
    let baseQuery = supabase
      .from("hotels")
      .select(
        "id, name, star_rating, min_price, city, district, address, phone, description, latitude, longitude, hotel_types(type), hotel_facilities(facility_name), hotel_images(image_url, sort_order)",
        { count: "exact" }
      );

    // 處理 ID 篩選
    if (finalIds) {
      if (finalIds.length < 200) {
        baseQuery = baseQuery.in("id", finalIds);
      } else {
        // ID 太多時，分段處理或僅在 JS 端過濾（此處為保險做法）
        baseQuery = baseQuery.in("id", finalIds.slice(0, 200));
      }
    }

    // 處理星等
    if (starRatingsRaw) {
      const stars = starRatingsRaw
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n));
      if (stars.length > 0) baseQuery = baseQuery.in("star_rating", stars);
    }

    // 處理關鍵字
    if (keyword) {
      const sK = keyword.replace(/[,()]/g, "");
      baseQuery = baseQuery.or(
        `name.ilike.%${sK}%,city.ilike.%${sK}%,district.ilike.%${sK}%`
      );
    }

    const {
      data: hotelsData,
      error: hotelsError,
      count,
    } = await baseQuery.range(offset, offset + limit - 1);
    if (hotelsError) throw hotelsError;

    // F. 格式化回傳
    const hotels = (hotelsData ?? []).map((h: any) => {
      const featureImage = (h.hotel_images ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
      )[0]?.image_url;
      return {
        ...h,
        types: (h.hotel_types ?? []).map((t: any) => t.type),
        facilities: (h.hotel_facilities ?? []).map((f: any) => f.facility_name),
        image_url:
          featureImage ||
          "https://res.cloudinary.com/wantrip/image/upload/v1767939338/%E9%A3%AF%E5%BA%97%E9%A6%96%E5%9C%96_dualwy.jpg",
      };
    });

    return res.json({ total: count ?? 0, page, limit, hotels });
  } catch (err: any) {
    console.error("❌ 搜尋失敗：", err.message);
    return res
      .status(500)
      .json({ message: "取得飯店資料失敗", detail: err.message });
  }
});

// --- 2. 取得單一飯店 ---
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("hotels")
      .select(
        "*, hotel_types(type), hotel_facilities(facility_name), hotel_images(image_url, sort_order)"
      )
      .eq("id", req.params.id)
      .single();
    if (error || !data)
      return res.status(404).json({ message: "找不到該飯店" });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: "伺服器錯誤" });
  }
});

// --- 3. 取得飯店房型 ---
router.get("/:id/rooms", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        "id, name, price, capacity, image_url, room_type:room_type_id(id, name, room_details(content))"
      )
      .eq("hotel_id", req.params.id)
      .order("price", { ascending: true }); // 修正了原本的語法錯誤

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: "取得房型失敗" });
  }
});

export default router;
