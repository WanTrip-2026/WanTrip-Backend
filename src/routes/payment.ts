import { Router, Request, Response } from "express";
import {
  getAioCheckoutParams,
  verifyCheckMacValue,
} from "../services/ECPayService.js";
import LinePayService from "../services/LinePayService.js";
import { supabaseAdmin } from "../services/supabaseAdmin.js";
import { mapToOrderDbSchema } from "../utils/orderMapper.js";

import { tempOrderStorage } from "../services/TempOrderStore.js";
import { OrderService } from "../services/OrderService.js";

const PaymentRouter: Router = Router();

// 1. 取得綠界 AIO 參數
PaymentRouter.post("/get-aio-params", (req, res) => {
  try {
    const { amount, orderId, ...orderPayload } = req.body;
    const tradeNo =
      orderId ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
          2,
          "0",
        )}${String(now.getDate()).padStart(2, "0")}${Math.floor(
          Math.random() * 1000000,
        )
          .toString()
          .padStart(6, "0")}`;
      })();

    // Store the payload temporarily
    // We mix in the amount and orderId into the payload just in case
    const fullPayload = { ...orderPayload, price: amount, order_id: tradeNo };
    tempOrderStorage.set(tradeNo, fullPayload);
    console.log(
      `[Payment] Stored temp order for ${tradeNo}. Storage size: ${tempOrderStorage.size}`,
    );

    const params = getAioCheckoutParams(Number(amount), tradeNo);
    res.json({ success: true, data: params });
  } catch (error: any) {
    console.error("Get AIO Params Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper logic for creating/updating order
// Now delegates to OrderService
async function processPaymentResult(orderId: string) {
  const result = await OrderService.processPaymentSuccess(orderId);
  return result.success;
}

PaymentRouter.post("/callback", async (req: Request, res: Response) => {
  console.log("--- 收到綠界回傳 ---");
  const payload = req.body;

  if (!verifyCheckMacValue(payload)) {
    return res.send("0|CheckMacValueVerifyFail");
  }

  if (payload.RtnCode === "1") {
    console.log(`訂單 ${payload.MerchantTradeNo} 付款成功`);
    await processPaymentResult(payload.MerchantTradeNo);
  }

  res.send("1|OK");
});

// 3. 處理綠界 Client 端 POST 回來 redirect 到前端
PaymentRouter.post("/ecpay-result", async (req: Request, res: Response) => {
  console.log("--- ECPay Result Redirect ---");
  const payload = req.body;

  // Validate just in case, though it's less critical here as we are just redirecting mostly,
  // but for creating order we should safeguard.
  // Note: ECPay result redirect params might be slightly different or same as callback.
  // Generally they contain similar info.
  if (payload.RtnCode === "1") {
    console.log(
      `(Redirect) Checking/Creating order for ${payload.MerchantTradeNo}`,
    );
    await processPaymentResult(payload.MerchantTradeNo);
  }

  // Redirect to frontend
  const frontendUrl = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  // We can pass the orderId or just let the frontend fetch latest.
  // Passing orderId is good for the success page to query.
  res.redirect(
    `${frontendUrl}/orders/completed?orderId=${payload.MerchantTradeNo}`,
  );
});

PaymentRouter.use("/", LinePayService.router);

export default PaymentRouter;
