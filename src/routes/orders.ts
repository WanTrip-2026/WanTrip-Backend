import express, { Request, Response } from "express";
import { supabase } from "../supabase";

const router = express.Router();

// GET all orders (for admin or debug)
router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("orders").select("*");

  if (error) {
    console.error("Supabase error (GET /):", error);
    return res.status(500).json({ message: "取得訂單資料失敗" });
  }

  res.json(data);
});

// GET orders by User ID
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error (GET /user/:userId):", error);
    return res.status(500).json({ message: "Error fetching user orders" });
  }
  res.json(data);
});

// POST new order
router.post("/", async (req: Request, res: Response) => {
  const newOrder = req.body;
  console.log("Creating new order - Payload:", newOrder);
  console.log(
    "Hotel ID:",
    newOrder.hotel_id,
    "Type:",
    typeof newOrder.hotel_id,
  );
  console.log(
    "Attraction ID:",
    newOrder.attraction_id,
    "Type:",
    typeof newOrder.attraction_id,
  );

  // Map frontend fields (from createOrder in OrderCheckOut.vue) to DB columns
  const orderPayload = {
    user_id: newOrder.user_id,
    order_id:
      newOrder.order_id ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${Math.floor(
          Math.random() * 1000000,
        )
          .toString()
          .padStart(6, "0")}`;
      })(),
    hotel_name: newOrder.hotelName || newOrder.title, // Fallback
    room_type: newOrder.roomType || newOrder.subtitle,
    check_in_date:
      newOrder.checkInDate ||
      (newOrder.date ? newOrder.date.split(" ")[0] : null),
    check_out_date: newOrder.checkOutDate,
    price: newOrder.orderAmount || newOrder.price,
    status: "completed", // Default strictly for MVP
    contact_name: newOrder.userInfo?.name,
    contact_email: newOrder.userInfo?.email,
    contact_phone: newOrder.userInfo?.phone,
    image_url: newOrder.image || newOrder.image_url,
    hotel_id: newOrder.hotel_id || null, // Ensure null if empty string
    attraction_id: newOrder.attraction_id || null,
    // created_at is automatic if column default is set, otherwise:
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select()
    .single();

  if (error) {
    console.error("Supabase error:", error);
    return res.status(500).json({ message: "建立訂單失敗", error });
  }

  res.json(data);
});

// GET single order by order_id or id
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  // Simple UUID regex check
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let query = supabase.from("orders").select("*");

  if (isUuid) {
    query = query.eq("id", id);
  } else {
    query = query.eq("order_id", id);
  }

  const { data: orderData, error: orderError } = await query.maybeSingle();

  if (orderError || !orderData) {
    console.error("Supabase error (GET /:id):", orderError);
    return res.status(404).json({ message: "Order not found" });
  }

  // Fetch hotel coordinates if hotel_id exists
  if (orderData.hotel_id) {
    const { data: hotelData } = await supabase
      .from("hotels")
      .select("latitude, longitude")
      .eq("id", orderData.hotel_id)
      .maybeSingle();

    if (hotelData) {
      (orderData as any).latitude = hotelData.latitude;
      (orderData as any).longitude = hotelData.longitude;
    }
  }

  res.json(orderData);
});

export default router;
