import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import hotelsRouter from "./routes/hotels.js";
import ordersRouter from "./routes/orders.js";
import userRouter from "./routes/users.js";
import facilitiesRouter from "./routes/facilities.js";
import paymentRouter from "./routes/payment.js";
import hotelImagesRouter from "./routes/hotelImages.js";
import hotelTypesRouter from "./routes/hotelTypes.js";
import authRouter from "./routes/auth/index.js";
import featuredHotelsRouter from "./routes/hotelFeatured.js";
import hotelNearbyRouter from "./routes/hotelNearby.js";
import hotelRecommendedRouter from "./routes/hotelRecommended.js";
import ticketsRouter from "./routes/tickets.js";

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || "http://wantrip.store",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
// 處理根目錄請求，避免監測工具報 404
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// ✅ Routes
app.use("/api/hotels/recommended", hotelRecommendedRouter);
app.use("/api/hotels/nearby", hotelNearbyRouter);
app.use("/api/hotels", hotelsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/users", userRouter);
app.use("/api/facilities", facilitiesRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/hotel_images", hotelImagesRouter);
app.use("/api/hotel_types", hotelTypesRouter);
app.use("/api/hotel_featured", featuredHotelsRouter);
app.use("/api/tickets", ticketsRouter);

// ✅ Auth
app.use("/api/auth", authRouter);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Global Error]", err);
  res.status(500).json({ message: "Internal Server Error" });
});
// 確保能接收外部請求
const portNumber = typeof PORT === "string" ? parseInt(PORT, 10) : PORT;
app.listen(portNumber, "0.0.0.0", () => {
  console.log(`Server is running on port ${portNumber}`);
  console.log(`Local access: http://localhost:${portNumber}`);
});
