import express, { Application } from 'express';
import cors from 'cors';
import 'dotenv/config';
import PaymentRouter from '../PaymentRouter';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
// 必加：處理綠界 Callback 的表單格式 (urlencoded)
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/payment', PaymentRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[WanTrip Server] Running at http://localhost:${PORT}`);
});