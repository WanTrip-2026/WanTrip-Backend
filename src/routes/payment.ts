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

import { OrderValidator } from "../services/OrderValidator.js";

// 1. 取得綠界 AIO 參數
PaymentRouter.post("/get-aio-params", async (req, res) => {
  try {
    const { amount, orderId, ...orderPayload } = req.body;

    // [NEW] Validation Logic
    // We reconstruct a payload shape that validator expects
    const validationPayload = {
      ...orderPayload,
      // The frontend passes 'amount' as the total price
      orderAmount: Number(amount),
      quantity: Number(orderPayload.quantity || orderPayload.peopleNum || 1), // Fallback logic
      peopleNum: Number(orderPayload.peopleNum),
      coupon: orderPayload.coupon,
    };

    const validation = await OrderValidator.validateOrder(validationPayload);

    if (!validation.isValid) {
      console.warn(`[Payment] Order validation failed: ${validation.message}`);
      return res
        .status(400)
        .json({ success: false, message: validation.message });
    }

    // Use Validated Amount from Backend
    const finalAmount = validation.pricing?.total ?? Number(amount);

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
    const fullPayload = {
      ...orderPayload,
      order_id: tradeNo,
      orderAmount: finalAmount,
      price: validation.pricing?.unitPrice ?? orderPayload.price,
      pricingDetails: validation.pricing,
    };
    tempOrderStorage.set(tradeNo, fullPayload);
    console.log(
      `[Payment] Stored temp order for ${tradeNo}. Storage size: ${tempOrderStorage.size}`,
    );

    const params = getAioCheckoutParams(finalAmount, tradeNo);
    res.json({ success: true, data: params });
  } catch (error: any) {
    console.error("Get AIO Params Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper logic for creating/updating order
// Now delegates to OrderService
async function processPaymentResult(orderId: string, paidAmount?: number) {
  const result = await OrderService.processPaymentSuccess(orderId, paidAmount);
  return result.success;
}

PaymentRouter.post("/callback", async (req: Request, res: Response) => {
  console.log("--- 收到綠界回傳 ---");
  const payload = req.body;

  if (!verifyCheckMacValue(payload)) {
    return res.send("0|CheckMacValueVerifyFail");
  }

  if (payload.RtnCode === "1") {
    const paidAmount =
      Number(payload.TradeAmt ?? payload.Amount ?? 0) || undefined;
    await processPaymentResult(payload.MerchantTradeNo, paidAmount);
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
  const frontendUrl = process.env.FRONTEND_ORIGIN || "http://wantrip.store";
  // We can pass the orderId or just let the frontend fetch latest.
  // Passing orderId is good for the success page to query.
  res.redirect(
    `${frontendUrl}/orders/completed?orderId=${payload.MerchantTradeNo}`,
  );
});

PaymentRouter.use("/", LinePayService.router);

export default PaymentRouter;
