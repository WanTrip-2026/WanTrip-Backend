import "dotenv/config";
import express from "express";
import cors from "cors";
import hotelsRouter from "./routes/hotels.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api/hotels", hotelsRouter);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
