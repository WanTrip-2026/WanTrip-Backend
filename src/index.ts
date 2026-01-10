import "dotenv/config";
import express from "express";
import cors from "cors";
import hotelsRouter from "./routes/hotels";
import ordersRouter from "./routes/orders";
import userRouter from "./routes/users";
import facilitiesRouter from "./routes/facilities";
import paymentRouter from "./PaymentRouter";
import hotelImagesRouter from "./routes/hotelImages";
import hotelTypesRouter from "./routes/hotelTypes";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api/hotels", hotelsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/users", userRouter);
app.use("/api/facilities", facilitiesRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/hotel_images", hotelImagesRouter);
app.use("/api/hotel_types", hotelTypesRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
