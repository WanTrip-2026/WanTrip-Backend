import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 20, 1);
    const offset = (page - 1) * limit;

    // Query params
    const facilityNames =
      (req.query.facility_names as string | undefined)?.trim() ?? "";
    const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";

    const starRatingsRaw = (req.query.star_ratings as string | undefined) ?? "";
    const starRatings =
      starRatingsRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n)) ?? [];

    const typesRaw = (req.query.types as string | undefined)?.trim() ?? "";
    const types =
      typesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    // Avoid breaking PostgREST filter string with commas
    const safeKeyword = keyword.replace(/,/g, " ");

    // 1) Facilities AND filter: compute matched hotel ids
    let hotelIdsByFacilities: string[] | null = null;

    if (facilityNames) {
      const selectedFacilities = facilityNames
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const { data: hfData, error: hfErr } = await supabase
        .from("hotel_facilities")
        .select("hotel_id, facility_name")
        .in("facility_name", selectedFacilities);

      if (hfErr) throw hfErr;

      const hitCount = new Map<string, Set<string>>();
      for (const row of hfData ?? []) {
        const hotelId = (row as any).hotel_id as string;
        const fName = (row as any).facility_name as string;

        if (!hitCount.has(hotelId)) hitCount.set(hotelId, new Set());
        hitCount.get(hotelId)!.add(fName);
      }

      hotelIdsByFacilities = [];
      for (const [hotelId, fSet] of hitCount.entries()) {
        if (selectedFacilities.every((f) => fSet.has(f))) {
          hotelIdsByFacilities.push(hotelId);
        }
      }

      if (hotelIdsByFacilities.length === 0) {
        return res.json({ total: 0, page, limit, hotels: [] });
      }
    }

    // 2) Types filter: get hotel ids for this page + total count

    let typeHotelIds: string[] | null = null;

    if (types.length > 0) {
      const { data: htData, error: htErr } = await supabase
        .from("hotel_types")
        .select("hotel_id")
        .in("type", types);

      if (htErr) throw htErr;

      typeHotelIds = Array.from(
        new Set((htData ?? []).map((r: any) => r.hotel_id as string))
      );

      if (typeHotelIds.length === 0) {
        return res.json({ total: 0, page, limit, hotels: [] });
      }
    }

    // 3) Query hotels with all filters
    let baseQuery = supabase.from("hotels").select(
      `
        id, name, star_rating, min_price, city, district, address, phone, description,latitude, longitude,
        hotel_facilities (facility_name),
        hotel_images (image_url, sort_order)
        `,
      { count: "exact" }
    );

    if (safeKeyword) {
      baseQuery = baseQuery.or(
        `name.ilike.%${safeKeyword}%,city.ilike.%${safeKeyword}%,district.ilike.%${safeKeyword}%`
      );
    }

    if (starRatings.length > 0) {
      baseQuery = baseQuery.in("star_rating", starRatings);
    }

    if (hotelIdsByFacilities) {
      baseQuery = baseQuery.in("id", hotelIdsByFacilities);
    }

    // types page ids

    if (typeHotelIds) {
      baseQuery = baseQuery.in("id", typeHotelIds);
    }

    // 一律在 hotels 上分頁
    const hotelsResult = await baseQuery.range(offset, offset + limit - 1);

    const { data: hotelsData, error: hotelsError, count } = hotelsResult as any;

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
          "https://res.cloudinary.com/wantrip/image/upload/v1767939338/%E9%A3%AF%E5%BA%97%E9%A6%96%E5%9C%96_dualwy.jpg",
      };
    });

    // Decide total
    // - If types filter is used, total should come from hotel_types count
    // - Otherwise use hotels count
    const total = count ?? 0;

    return res.json({ total, page, limit, hotels });
  } catch (err: any) {
    console.error("取得飯店資料失敗：", err?.message || err);
    return res.status(500).json({
      message: "取得飯店資料失敗",
      detail: err?.message ?? String(err),
    });
  }
});
// 取得單一飯店（給飯店詳細頁用）
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("hotels")
      .select(
        `
        id, name, star_rating, min_price, city, district, address, phone, description,
        hotel_facilities (facility_name),
        hotel_images (image_url, sort_order)
        `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        message: "找不到該飯店",
        detail: error?.message ?? "No data",
      });
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
        "https://res.cloudinary.com/wantrip/image/upload/v1767939338/%E9%A3%AF%E5%BA%97%E9%A6%96%E5%9C%96_dualwy.jpg",
    };

    return res.json(hotel);
  } catch (err: any) {
    console.error("取得單一飯店失敗：", err?.message || err);
    return res.status(500).json({
      message: "取得單一飯店失敗",
      detail: err?.message ?? String(err),
    });
  }
});
// 取得飯店資料(room_details）
router.get("/:id/rooms", async (req, res) => {
  console.log("HIT rooms-based API /hotels/:id/rooms");

  try {
    const hotelId = req.params.id;

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
      `
      )
      .eq("hotel_id", hotelId)
      .order("price", { ascending: true });

    if (error) {
      console.error("[rooms] supabase error:", error);
      return res.status(500).json({
        message: "取得房型資料失敗",
        supabase_error: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
      });
    }

    const rooms = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? r.room_type?.name ?? "",
      price: r.price ?? 0,
      capacity: r.capacity ?? 0,
      image_url: r.image_url ?? "",
      details: (r.room_type?.room_details ?? []).map((d: any) => d.content),
      features: [],
    }));

    return res.json(rooms);
  } catch (err: any) {
    console.error("[rooms] server error:", err);
    return res
      .status(500)
      .json({ message: "取得房型資料失敗", server_error: err?.message });
  }
});

export default router;
