import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();
console.log("[hotelsRouter] loaded file:", import.meta.url);

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
    // This avoids huge "in(id, ...)" lists when a type has many hotels (e.g., 民宿).
    let pageHotelIdsByTypes: string[] | null = null;
    let typesTotalCount: number | null = null;

    if (types.length > 0) {
      // total count for types
      const { count: tCount, error: tCountErr } = await supabase
        .from("hotel_types")
        .select("hotel_id", { count: "exact", head: true })
        .in("type", types);

      if (tCountErr) throw tCountErr;
      typesTotalCount = tCount ?? 0;

      if (typesTotalCount === 0) {
        return res.json({ total: 0, page, limit, hotels: [] });
      }

      // fetch only hotel_ids for this page
      const { data: htData, error: htErr } = await supabase
        .from("hotel_types")
        .select("hotel_id")
        .in("type", types)
        .range(offset, offset + limit - 1);

      if (htErr) throw htErr;

      pageHotelIdsByTypes = Array.from(
        new Set((htData ?? []).map((r: any) => r.hotel_id as string))
      );

      if (pageHotelIdsByTypes.length === 0) {
        // A page beyond available data
        return res.json({ total: typesTotalCount, page, limit, hotels: [] });
      }
    }

    // 3) Query hotels with all filters
    let baseQuery = supabase.from("hotels").select(
      `
        id, name, star_rating, min_price, city, district, address, phone, description,
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
    if (pageHotelIdsByTypes) {
      baseQuery = baseQuery.in("id", pageHotelIdsByTypes);
    }

    // If types filter is used, paging is already done by hotel_types ids,
    // so we should NOT apply range again on hotels; it could shrink the page twice.
    const hotelsResult =
      types.length > 0
        ? await baseQuery
        : await baseQuery.range(offset, offset + limit - 1);

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
          "https://cdn.hk01.com/di/media/images/3366554/org/1a17ee577918293a276a61cded582477.jpg/CwABjWRXi8m70sf513Oli2_Nrybz9IXncrQxZHK0MWQ?v=w1280r16_9",
      };
    });

    // Decide total
    // - If types filter is used, total should come from hotel_types count
    // - Otherwise use hotels count
    const total = types.length > 0 ? typesTotalCount ?? 0 : count ?? 0;

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
        "https://cdn.hk01.com/di/media/images/3366554/org/1a17ee577918293a276a61cded582477.jpg/CwABjWRXi8m70sf513Oli2_Nrybz9IXncrQxZHK0MWQ?v=w1280r16_9",
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

export default router;
