import { Router, Request, Response } from "express";
import {
  getAioCheckoutParams,
  verifyCheckMacValue,
} from "../services/ECPayService.js";
import LinePayService from "../services/LinePayService.js";
import { supabaseAdmin } from "../services/supabaseAdmin.js";
import { mapToOrderDbSchema } from "../utils/orderMapper.js";

import { tempOrderStorage } from "../services/TempOrderStore.js";

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

PaymentRouter.post("/callback", async (req: Request, res: Response) => {
  console.log("--- 收到綠界回傳 ---");
  const payload = req.body;

  if (!verifyCheckMacValue(payload)) {
    return res.send("0|CheckMacValueVerifyFail");
  }

  if (payload.RtnCode === "1") {
    console.log(`訂單 ${payload.MerchantTradeNo} 付款成功`);

    const orderId = payload.MerchantTradeNo;
    const pendingOrder = tempOrderStorage.get(orderId);

    if (pendingOrder) {
      console.log(`Found pending order for ${orderId}, creating in DB...`);
      console.log(`[DEBUG] Pending Order User ID: ${pendingOrder.user_id}`);

      const safePayload = mapToOrderDbSchema(pendingOrder);

      // Create order in Supabase
      const { error, data } = await supabaseAdmin
        .from("orders")
        .insert(safePayload)
        .select()
        .single();

      if (error) {
        console.error("建立訂單失敗:", error);
      } else {
        console.log("訂單建立成功, ID:", data?.id);
        tempOrderStorage.delete(orderId); // Clean up
      }
    } else {
      // Fallback: Maybe order already exists? Update it just in case
      console.log(`No pending order found for ${orderId}, trying update...`);
      supabaseAdmin
        .from("orders")
        .update({ status: "completed" })
        .eq("order_id", orderId)
        .then(({ error }) => {
          if (error) {
            console.error("更新訂單狀態失敗:", error);
          } else {
            console.log("訂單狀態已更新為 completed");
          }
        });
    }
  }

  res.send("1|OK");
});

// 3. 處理綠界 Client 端 POST 回來 redirect 到前端
PaymentRouter.post("/ecpay-result", (req: Request, res: Response) => {
  console.log("--- ECPay Result Redirect ---");
  const payload = req.body;
  // Redirect to frontend
  const frontendUrl = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  res.redirect(
    `${frontendUrl}/orders/completed?orderId=${payload.MerchantTradeNo}`,
  );
});

PaymentRouter.use("/", LinePayService.router);

export default PaymentRouter;
