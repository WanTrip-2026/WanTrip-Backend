import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string) || 20, 1);
    const offset = (page - 1) * limit;

    const facilityNames = (
      req.query.facility_names as string | undefined
    )?.trim();
    const keyword = (req.query.keyword as string | undefined)?.trim();
    const starRatingsRaw = req.query.star_ratings as string | undefined; // e.g. "5,4,3"
    const starRatings =
      starRatingsRaw
        ?.split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n)) ?? [];

    // 1) 先處理「設施篩選」：取得符合條件的 hotel_id 清單
    let hotelIdsByFacilities: string[] | null = null;

    if (facilityNames) {
      const selected = facilityNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 抓出包含這些設施的 hotel_id（這裡用「先抓多一點再做集合」的簡化作法）
      // 這段如果飯店量很大，可以再優化成 RPC/SQL HAVING COUNT
      const { data: hfData, error: hfErr } = await supabase
        .from("hotel_facilities")
        .select("hotel_id, facility_name")
        .in("facility_name", selected);

      if (hfErr) throw hfErr;

      // 計算每個 hotel_id 擁有的設施命中數
      const hitCount = new Map<string, Set<string>>();
      for (const row of hfData ?? []) {
        if (!hitCount.has(row.hotel_id)) hitCount.set(row.hotel_id, new Set());
        hitCount.get(row.hotel_id)!.add(row.facility_name);
      }

      hotelIdsByFacilities = [];
      for (const [hotelId, set] of hitCount.entries()) {
        if (selected.every((f) => set.has(f)))
          hotelIdsByFacilities.push(hotelId);
      }

      // 如果沒有任何符合設施的飯店，直接回空結果（避免繼續查）
      if (hotelIdsByFacilities.length === 0) {
        return res.json({ total: 0, page, limit, hotels: [] });
      }
    }

    // 2) 查 hotels：在 DB query 階段套用 keyword + facilities(用 in ids)
    let baseQuery = supabase.from("hotels").select(
      `id, name, star_rating, min_price, city, district, address, phone, description,
         hotel_facilities (facility_name),
         hotel_images (image_url, sort_order)`,
      { count: "exact" }
    );

    if (keyword) {
      baseQuery = baseQuery = baseQuery.or(
        `name.ilike.%${keyword}%,city.ilike.%${keyword}%,district.ilike.%${keyword}%`
      );
    }
    if (starRatings.length > 0) {
      baseQuery = baseQuery.in("star_rating", starRatings);
    }
    if (hotelIdsByFacilities) {
      baseQuery = baseQuery.in("id", hotelIdsByFacilities);
    }

    // ⚠️ 一定要最後再 range（確保分頁是針對篩完的結果）
    const {
      data: hotelsData,
      error: hotelsError,
      count,
    } = await baseQuery.range(offset, offset + limit - 1);

    if (hotelsError) throw hotelsError;

    const hotels = (hotelsData ?? []).map((h: any) => {
      const featureImage = (h.hotel_images ?? [])
        .slice()
        .sort(
          (a: any, b: any) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
        )[0]?.image_url;

      return {
        ...h,
        facilities: (h.hotel_facilities ?? []).map((f: any) => f.facility_name),
        image_url:
          featureImage ||
          "https://cdn.hk01.com/di/media/images/3366554/org/1a17ee577918293a276a61cded582477.jpg/CwABjWRXi8m70sf513Oli2_Nrybz9IXncrQxZHK0MWQ?v=w1280r16_9",
      };
    });

    res.json({
      total: count ?? 0,
      page,
      limit,
      hotels,
    });
  } catch (err: any) {
    console.error("取得飯店資料失敗：", err.message || err);
    res.status(500).json({ message: "取得飯店資料失敗", detail: err.message });
  }
});

// 取得單一飯店（給飯店詳細頁用）
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("hotels")
      .select(
        `id, name, star_rating, min_price, city, district, address, phone, description,
         hotel_facilities (facility_name),
         hotel_images (image_url, sort_order)`
      )
      .eq("id", id)
      .single();

    if (error) {
      // single() 找不到資料時通常也會進 error，這裡回 404 比較合理
      return res
        .status(404)
        .json({ message: "找不到該飯店", detail: error.message });
    }

    const featureImage = (data.hotel_images ?? [])
      .slice()
      .sort(
        (a: any, b: any) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
      )[0]?.image_url;

    const hotel = {
      ...data,
      facilities: (data.hotel_facilities ?? []).map(
        (f: any) => f.facility_name
      ),
      image_url:
        featureImage ||
        "https://cdn.hk01.com/di/media/images/3366554/org/1a17ee577918293a276a61cded582477.jpg/CwABjWRXi8m70sf513Oli2_Nrybz9IXncrQxZHK0MWQ?v=w1280r16_9",
    };

    return res.json(hotel);
  } catch (err: any) {
    console.error("取得單一飯店失敗：", err.message || err);
    return res
      .status(500)
      .json({ message: "取得單一飯店失敗", detail: err.message });
  }
});

export default router;
