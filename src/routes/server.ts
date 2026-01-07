import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import 'dotenv/config';

import paymentRouter from '../PaymentRouter';

const app: Application = express();

app.use(cors());
app.use(express.json());

app.use('/api/payment', paymentRouter);

interface EcpayPaymentConfig {
  MerchantID: string;
  HashKey: string;
  HashIV: string;
  ApiURL: string;
}

export const ECPAY_CONFIG: EcpayPaymentConfig = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '',
  HashKey: process.env.ECPAY_HASH_KEY || '',
  HashIV: process.env.ECPAY_HASH_IV || '',
  ApiURL: process.env.ECPAY_API_URL || 'https://ecpg-stage.ecpay.com.tw/Merchant/CreatePayment'
};

function encryptPaymentData(data: object, key: string, iv: string): string {
  const jsonString: string = JSON.stringify(data);
  const urlEncoded: string = encodeURIComponent(jsonString);

  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(key),
    Buffer.from(iv)
  );
  
  let encrypted: string = cipher.update(urlEncoded, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  return encrypted.replace(/\n/g, '').replace(/\r/g, '');
}

app.post('/api/payment/get-token', async (req: Request, res: Response) => {
  console.log('--- 收到前端請求 ---');
  
  try {
    const amount: number = parseInt(req.body.amount) || 1200;
    const merchantTradeNo: string = 'WT' + Date.now();
    
    const now: Date = new Date();
    const tradeDate: string = now.getFullYear() + '/' + 
      String(now.getMonth() + 1).padStart(2, '0') + '/' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0') + ':' + 
      String(now.getSeconds()).padStart(2, '0');

    // 綠界訂單內容物件定義
    const orderData = {
      MerchantID: ECPAY_CONFIG.MerchantID,
      RememberCard: 1,
      PaymentUIType: 2,
      ChoosePaymentList: '', 
      OrderInfo: {
        MerchantTradeNo: merchantTradeNo,
        MerchantTradeDate: tradeDate,
        TotalAmount: amount,
        TradeDesc: 'WanTrip',
        ItemName: 'Tour',
        ReturnURL: 'https://www.ecpay.com.tw',
        OrderResultURL: 'http://localhost:5173',
      },
      CardInfo: {
        OrderResultURL: 'http://localhost:5173',
        CreditInstallment: '0',
        InstallmentAmount: 0,
        Redeem: false
      }
    };

    const encryptedData: string = encryptPaymentData(orderData, ECPAY_CONFIG.HashKey, ECPAY_CONFIG.HashIV);
    const timestamp: number = Math.floor(Date.now() / 1000);

    const apiResponse = await axios.post(ECPAY_CONFIG.ApiURL, {
      MerchantID: ECPAY_CONFIG.MerchantID,
      RqHeader: {
        Timestamp: timestamp,
        Revision: '1.0.0'
      },
      Data: encryptedData 
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('--- 綠界成功回應 ---', apiResponse.data);
    res.json(apiResponse.data);

  } catch (error) {
    const axiosError = error as AxiosError;
    const errorData = axiosError.response?.data;

    if (typeof errorData === 'string' && errorData.includes('html')) {
        console.error('❌ 綠界回傳 HTML 錯誤。請檢查 ApiURL 是否正確。');
    } else {
        console.error('❌ 錯誤細節:', errorData || axiosError.message);
    }
    res.status(500).json({ error: '綠界連線失敗' });
  }
});

function generatePaymentSignature(uri: string, body: object, nonce: string, secret: string): string {
  const data = secret + uri + JSON.stringify(body) + nonce;
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64');
}