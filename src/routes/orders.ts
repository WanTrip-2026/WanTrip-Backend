import express, { Request, Response } from "express";
import supabase from "../services/supabase.js";
import { requireSupabaseAuth } from "../middlewares/requireSupabaseAuth.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

// 1. Define Typed Request
interface AuthenticatedRequest extends Request {
  user?: any; // In a real app, define User interface from Supabase types
}

const router = express.Router();

const ORDER_STATUS = {
  COMPLETED: "訂購完成",
  PENDING: "未付款",
} as const;

// Helper: Generate Order ID
const generateOrderId = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(now.getDate()).padStart(2, "0")}`;
  const randomPart = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `${datePart}${randomPart}`;
};

// Middleware: Require Supabase Auth for all order routes
router.use(requireSupabaseAuth);

// GET all orders (Admin Only)
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("orders").select("*");

  if (error) {
    console.error("Supabase error (GET /):", error);
    return res.status(500).json({ message: "取得訂單資料失敗" });
  }

  res.json(data);
});

// GET my orders (Logged-in User)
router.get("/me", async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error (GET /me):", error);
    return res.status(500).json({ message: "取得個人訂單失敗" });
  }
  res.json(data);
});

// GET orders by User ID (Admin Only)
router.get(
  "/user/:userId",
  requireAdmin,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error (GET /user/:userId):", error);
      return res.status(500).json({ message: "取得使用者訂單失敗" });
    }
    res.json(data);
  },
);

// POST new order (Authenticated User) - DEPRECATED/REMOVED
// This endpoint is no longer used as orders are created via payment callbacks.
// router.post("/", async (req: Request, res: Response) => { ... });

// GET single order by order_id or id
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const isAdmin = user.user_metadata?.role === "admin";

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // 3. Optimize: Use Join Query to fetch related hotel/attraction data in one go
  // Note: This requires foreign keys to be set up in Supabase between orders.hotel_id -> hotels.id
  let query = supabase.from("orders").select("*, hotels(*), attractions(*)"); // Select all from orders, plus joined hotels and attractions

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

  // Permission Check
  if (orderData.user_id !== user.id && !isAdmin) {
    return res.status(403).json({
      message: "Forbidden: You do not have permission to view this order",
    });
  }

  // Flatten the response for frontend compatibility if needed
  // Instead of orderData.hotels.address, frontend might expect orderData.address
  // Let's merge them to maintain backward compatibility
  const responseData = { ...orderData };

  if (responseData.hotels) {
    const { city, district, address, latitude, longitude, phone } =
      responseData.hotels;
    Object.assign(responseData, {
      city,
      district,
      address,
      latitude,
      longitude,
      hotel_phone: phone,
    });
    delete responseData.hotels; // Clean up nested object
  } else if (responseData.attractions) {
    const { city, district, address } = responseData.attractions;
    Object.assign(responseData, { city, district, address });
    delete responseData.attractions;
  }

  res.json(responseData);
});

export default router;
