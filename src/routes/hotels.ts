import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    // 1. 取得並解析參數
    const keyword = (req.query.keyword as string | undefined)?.trim() ?? "";
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const totalPeople = parseInt(req.query.adults as string, 10) || 0;
    const roomsRequired = parseInt(req.query.rooms as string, 10) || 0;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string, 10) || 200, 1);
    const offset = (page - 1) * limit;

    const facilityNames =
      (req.query.facility_names as string | undefined)?.trim() ?? "";
    const starRatingsRaw = (req.query.star_ratings as string | undefined) ?? "";
    const typesRaw = (req.query.types as string | undefined)?.trim() ?? "";

    console.log("--- 搜尋開始 ---");
    console.log("參數檢查:", {
      keyword,
      startDate,
      endDate,
      totalPeople,
      roomsRequired,
    });

    let filterSets: string[][] = [];
    let finalIds: string[] | null = null;

    // --- A. 日期與庫存篩選 ---
    if (startDate && endDate) {
      // 1. 只抓必要的欄位，減少網路傳輸量
      const { data: inventoryData, error: invError } = await supabase
        .from("room_inventory")
        .select(
          `
      room_id,
      rooms!inner (
        hotel_id,
        capacity
      )
    `
        ) // 使用 !inner 確保只有關聯成功的才抓出來
        .gte("date", startDate)
        .lt("date", endDate)
        .gt("available_quantity", 0)
        .limit(5000);

      if (invError) {
        console.error("Supabase 內部錯誤:", invError);
        throw invError;
      }

      const hotelRoomMap = new Map<
        string,
        { totalCapacity: number; roomCount: number }
      >();
      const trackedRooms = new Set<string>();

      (inventoryData ?? []).forEach((item: any) => {
        // 因為使用了 rooms!inner，結構會變成 item.rooms
        const room = item.rooms;
        if (!room || !item.room_id) return;

        const hId = room.hotel_id;
        if (!hotelRoomMap.has(hId)) {
          hotelRoomMap.set(hId, { totalCapacity: 0, roomCount: 0 });
        }

        if (!trackedRooms.has(item.room_id)) {
          const h = hotelRoomMap.get(hId)!;
          h.totalCapacity += room.capacity || 0;
          h.roomCount += 1;
          trackedRooms.add(item.room_id);
        }
      });

      const dateHotelIds = Array.from(hotelRoomMap.entries())
        .filter(
          ([_, info]) =>
            info.totalCapacity >= totalPeople && info.roomCount >= roomsRequired
        )
        .map(([id]) => id);

      console.log("篩選後飯店數:", dateHotelIds.length);

      if (dateHotelIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
      filterSets.push(dateHotelIds);
    }

    // --- B. 設施篩選 ---
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
      console.log(`設施過濾後剩下: ${facilityHotelIds.length} 間飯店`);
      filterSets.push(facilityHotelIds);
    }

    // --- C. 類型篩選 ---
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
      console.log(`類型過濾後剩下: ${typeHotelIds.length} 間飯店`);
      filterSets.push(typeHotelIds);
    }

    // --- D. 計算最終交集 ID ---
    if (filterSets.length > 0) {
      finalIds = filterSets.reduce(
        (a, b) => a.filter((c) => b.includes(c)),
        filterSets[0]
      );
      console.log(`所有條件交集後最終飯店數: ${finalIds.length}`);
      if (finalIds.length === 0)
        return res.json({ total: 0, page, limit, hotels: [] });
    }

    // --- E. 分頁查詢 ---
    let hotelIdsQuery = supabase
      .from("hotels")
      .select("id", { count: "exact" });
    if (finalIds) hotelIdsQuery = hotelIdsQuery.in("id", finalIds);
    if (keyword) {
      const sK = keyword.replace(/[,()]/g, "");
      hotelIdsQuery = hotelIdsQuery.or(
        `name.ilike.%${sK}%,city.ilike.%${sK}%,district.ilike.%${sK}%`
      );
    }
    if (starRatingsRaw) {
      const stars = starRatingsRaw
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n));
      if (stars.length > 0)
        hotelIdsQuery = hotelIdsQuery.in("star_rating", stars);
    }

    const {
      data: hotelIdsData,
      count: totalCount,
      error: countError,
    } = await hotelIdsQuery
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (countError) throw countError;

    const hotelIds = (hotelIdsData ?? []).map((h: any) => h.id);
    console.log(
      `分頁取出 ID 數量: ${hotelIds.length}, 資料庫符合總數: ${totalCount}`
    );

    if (hotelIds.length === 0)
      return res.json({ total: totalCount ?? 0, page, limit, hotels: [] });

    // --- F. 批量抓取細節 ---
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

    console.log("--- 搜尋完成，回傳結果 ---");
    return res.json({ total: totalCount ?? 0, page, limit, hotels });
  } catch (err: any) {
    console.error("❌ 搜尋失敗：", err.message);
    return res
      .status(500)
      .json({ message: "取得飯店資料失敗", detail: err.message });
  }
});

export default router;
