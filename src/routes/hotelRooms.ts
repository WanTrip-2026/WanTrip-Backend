import { Router, Request, Response } from "express";
import { supabase } from "../supabase.js";

const router = Router();

router.get("/:id/rooms", async (req: Request, res: Response) => {
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
      console.error("[GET /hotels/:id/rooms] supabase error:", error);
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
    console.error("[GET /hotels/:id/rooms] server error:", err);
    return res.status(500).json({
      message: "取得房型資料失敗",
      server_error: err?.message ?? String(err),
    });
  }
});

export default router;
