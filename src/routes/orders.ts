import express, { Request, Response } from "express";
import { supabase } from "../supabase";

const router = express.Router();

// GET all orders (for admin or debug)
router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("orders").select("*");

  if (error) {
    console.error("Supabase error (GET /):", error);
    return res.status(500).json({ message: "Failed to fetch orders" });
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
  console.log("Creating new order:", newOrder);

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
    // created_at is automatic if column default is set, otherwise:
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("orders")
    .insert([orderPayload])
    .select()
    .single();

  if (error) {
    console.error("Supabase error (POST /):", error);
    return res.status(500).json({ message: "Error creating order" });
  }

  res.json({ ok: true, order: data });
});

export default router;
