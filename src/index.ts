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
import authRouter from "./routes/auth";
import featuredHotelsRouter from "./routes/hotelFeatured.js";
import hotelNearbyRouter from "./routes/hotelNearby.js";
import hotelRecommendedRouter from "./routes/hotelRecommended.js";
import ticketsRouter from "./routes/tickets.js";

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
