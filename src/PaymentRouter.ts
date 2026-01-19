import { Router, Request, Response } from "express";
import {
  getAioCheckoutParams,
  verifyCheckMacValue,
} from "./routes/ECPayService";
import LinePayService from "./routes/LinePayService";

const PaymentRouter: Router = Router();

// 1. 取得綠界 AIO 參數
PaymentRouter.post("/get-aio-params", (req, res) => {
  try {
    const { amount, orderId } = req.body;
    const tradeNo =
      orderId ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${Math.floor(
          Math.random() * 1000000,
        )
          .toString()
          .padStart(6, "0")}`;
      })();

    const params = getAioCheckoutParams(Number(amount), tradeNo);
    res.json({ success: true, data: params });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

PaymentRouter.post("/callback", (req: Request, res: Response) => {
  console.log("--- 收到綠界回傳 ---");
  const payload = req.body;

  if (!verifyCheckMacValue(payload)) {
    return res.send("0|CheckMacValueVerifyFail");
  }

  if (payload.RtnCode === "1") {
    console.log(`訂單 ${payload.MerchantTradeNo} 付款成功`);
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
