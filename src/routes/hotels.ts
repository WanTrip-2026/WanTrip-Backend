import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase.js";

interface HotelSearchResult {
  hotel_id: string;
  total_count: number;
}

interface HotelInfo {
  id: string;
  name: string;
  star_rating: number;
  min_price: number;
  city: string;
  district: string;
  address: string;
  phone?: string;
  description?: string;
  image_url?: string;
}

interface RoomRawData {
  id: string;
  name: string | null;
  price: number | null;
  capacity: number | null;
  image_url: string | null;
  room_type?: {
    name?: string;
    room_details?: { content: string }[];
  };
}

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    // 解析前端參數
    const keyword = (req.query.keyword as string | undefined)?.trim() || null;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);
    const adults = parseInt(req.query.adults as string, 10) || 0;
    const rooms = parseInt(req.query.rooms as string, 10) || 0;
    const minPrice = parseInt(req.query.min_price as string, 10) || 0;
    const maxPrice = parseInt(req.query.max_price as string, 10) || 1000000;

    const hasPriceFilter =
      req.query.min_price !== undefined || req.query.max_price !== undefined;

    const starRatings =
      (req.query.star_ratings as string | undefined)
        ?.split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n)) || [];

    const facilityNames =
      (req.query.facility_names as string | undefined)
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) || [];

    // 兼容處理：不管它是字串還是陣列，都轉成字串陣列
    const rawTypes = req.query.types;
    const types = Array.isArray(rawTypes)
      ? rawTypes.map(String)
      : (rawTypes as string | undefined)
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) || [];

    // 傳給 RPC
    const p_types = types.length > 0 ? types : null;

    const startDate = req.query.start_date
      ? new Date(req.query.start_date as string)
      : null;
    const endDate = req.query.end_date
      ? new Date(req.query.end_date as string)
      : null;

    // RPC 撈 hotelIds
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "search_hotels",
      {
        p_keyword: keyword,
        p_start_date: startDate,
        p_end_date: endDate,
        p_adults: adults,
        p_rooms: rooms,
        p_star_ratings: starRatings.length > 0 ? starRatings : null,
        p_facility_names: facilityNames.length > 0 ? facilityNames : null,
        p_types: types.length > 0 ? types : null,
        p_min_price: minPrice,
        p_max_price: maxPrice,
        p_page: page,
        p_limit: limit,
      },
    );

    if (rpcError) throw rpcError;

    const hotelIds = ((rpcData as HotelSearchResult[]) ?? []).map(
      (r) => r.hotel_id,
    );
    const totalCount =
      (rpcData as HotelSearchResult[] | null)?.[0]?.total_count ?? 0;

    if (hotelIds.length === 0) {
      return res.json({ total: 0, raw_total: 0, page, limit, hotels: [] });
    }

    // 3. 抓基本資料
    const { data: hotelsData } = await supabase
      .from("hotels")
      .select("*")
      .in("id", hotelIds);

    // 4. 抓相關資料
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

    // 5. 組合資料
    let hotels = ((hotelsData as HotelInfo[]) ?? []).map((h) => {
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

    return res.json({
      total: totalCount,
      page,
      limit,
      hotels: hotels,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "發生未知錯誤";
    console.error("❌ 取得詳細失敗：", errorMessage);
    return res.status(500).json({
      message: "取得詳細失敗",
      detail: errorMessage,
    });
  }
});

// 取得房型
router.get("/:id/rooms", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        id,
        name,
        price,
        capacity,
        image_url,
        room_type:room_type_id (
          id,
          name,
          room_details ( content )
        )
      `,
      )
      .eq("hotel_id", id)
      .order("price", { ascending: true });

    if (error) throw error;

    const rooms = ((data as unknown as RoomRawData[]) ?? []).map((r) => ({
      id: r.id,
      name: r.name ?? r.room_type?.name ?? "",
      price: r.price ?? 0,
      capacity: r.capacity ?? 0,
      image_url: r.image_url ?? "",
      details: (r.room_type?.room_details ?? []).map((d) => d.content),
      features: [],
    }));

    return res.json(rooms);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("❌ 取得房型資料失敗：", errorMessage);
    return res.status(500).json({
      message: "取得房型資料失敗",
      detail: errorMessage,
    });
  }
});

// 取得飯店詳細資料
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("hotels")
      .select("*")
      .eq("id", id)
      .single<HotelInfo>();

    if (error || !data) throw error;

    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ 取得飯店詳細失敗：", msg);
    return res.status(500).json({ message: "取得飯店詳細失敗", detail: msg });
  }
});

export default router;
