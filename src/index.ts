import "dotenv/config";
import express from "express";
import cors from "cors";
import hotelsRouter from "./routes/hotels.js";
import ordersRouter from "./routes/orders.js";
import userRouter from "./routes/users.js";
import facilitiesRouter from "./routes/facilities.js";
import paymentRouter from "./PaymentRouter.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api/hotels", hotelsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/users", userRouter);
app.use("/api/facilities", facilitiesRouter);
app.use("/api/payment", paymentRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
