import { Router, Request, Response } from 'express';
import { getAioCheckoutParams, verifyCheckMacValue } from './routes/ECPayService';
import LinePayService from './routes/LinePayService';

const PaymentRouter: Router = Router();

// 1. 取得綠界 AIO 參數
PaymentRouter.post('/get-aio-params', (req, res) => {
  try {
    const { amount } = req.body;
    const tradeNo = `WT${Date.now()}`;

    const params = getAioCheckoutParams(Number(amount), tradeNo);
    res.json({ success: true, data: params });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

PaymentRouter.post('/callback', (req: Request, res: Response) => {
  console.log('--- 收到綠界回傳 ---');
  const payload = req.body;

  if (!verifyCheckMacValue(payload)) {
    return res.send('0|CheckMacValueVerifyFail');
  }

  if (payload.RtnCode === '1') {
    console.log(`訂單 ${payload.MerchantTradeNo} 付款成功`);
  }

  res.send('1|OK');
});

PaymentRouter.use('/', LinePayService.router);

export default PaymentRouter;