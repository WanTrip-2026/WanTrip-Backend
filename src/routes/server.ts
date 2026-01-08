import express, { Application } from 'express';
import cors from 'cors';
import 'dotenv/config';
import PaymentRouter from '../PaymentRouter';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/payment', PaymentRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[WanTrip Server] Running at http://localhost:${PORT}`);
});