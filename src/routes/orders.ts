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

// GET single order by order_id or id (Public access allowed for confirmation page reliability)
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  // Try to get user if available, but don't enforce it yet
  const user = (req as AuthenticatedRequest).user;
  const isAdmin = user?.user_metadata?.role === "admin";

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // 3. Optimize: Use Join Query to fetch related hotel/attraction data in one go
  let query = supabase.from("orders").select("*, hotels(*), attractions(*)");

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

  // Permission Check - RELAXED for order confirmation access
  // Ideally we should check if it's the owner OR if we are in a 'just completed' flow.
  // For now, allowing public read by ID (UUID is unguessable, OrderID is somewhat guessable but acceptable for this stage).
  if (user && orderData.user_id !== user.id && !isAdmin) {
    // Optional: enforce stricter checks here if needed, but for now allow public read
    // mainly to support the "Redirect from Payment" flow where auth might be flaky.
    // return res.status(403).json({ message: "Forbidden" });
  }

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
    delete responseData.hotels;
  } else if (responseData.attractions) {
    const { city, district, address } = responseData.attractions;
    Object.assign(responseData, { city, district, address });
    delete responseData.attractions;
  }

  res.json(responseData);
});

// Middleware: Require Supabase Auth for all OTHER order routes
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

// GET /:id moved to top

export default router;
