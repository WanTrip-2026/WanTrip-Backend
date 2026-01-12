import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import hotelsRouter from './routes/hotels.js'
import ordersRouter from './routes/orders.js'
import userRouter from './routes/users.js'
import facilitiesRouter from './routes/facilities.js'
import paymentRouter from './PaymentRouter.js'
import hotelImagesRouter from './routes/hotelImages'
import hotelTypesRouter from './routes/hotelTypes'
import authRouter from './routes/auth' // ✅ 對應 src/routes/auth/index.ts

const app = express()
const PORT = process.env.PORT || 3000

const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ✅ 原本 routes（不動 payment）
app.use('/api/hotels', hotelsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/users', userRouter)
app.use('/api/facilities', facilitiesRouter)
app.use('/api/payment', paymentRouter)
app.use('/api/hotel_images', hotelImagesRouter)
app.use('/api/hotel_types', hotelTypesRouter)

// ✅ auth（新增）
app.use('/api/auth', authRouter)

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
})
