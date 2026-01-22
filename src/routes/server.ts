import express, { Application } from "express";
import cors, { CorsOptions } from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import PaymentRouter from "./payment.js";
import authRouter from "../routes/auth/index.js";

const app: Application = express();

const corsOptions: CorsOptions = {
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ✅ 統一用同一份 options（避免 preflight 走到 *）
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter); // ✅ auth
app.use("/api/payment", PaymentRouter); // ✅ 不動 payment

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[WanTrip Server] Running at http://localhost:${PORT}`);
});
