import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Router, Request, Response } from 'express';
import 'dotenv/config';

interface PaymentProduct {
  name: string;
  quantity: number;
  price: number;
}

interface PaymentPackage {
  id: string;
  amount: number;
  products: PaymentProduct[];
}

interface LinePayRequestBody {
  amount: number;
  currency: string;
  orderId: string;
  packages: PaymentPackage[];
  redirectUrls: {
    confirmUrl: string;
    cancelUrl: string;
  };
}

interface ConfirmBody {
  amount: number;
  currency: string;
}

const LINE_PAY_CHANNEL_ID: string | undefined = process.env.LINE_PAY_CHANNEL_ID;
const LINE_PAY_CHANNEL_SECRET: string | undefined = process.env.LINE_PAY_CHANNEL_SECRET;
const LINE_PAY_SITE: string | undefined = process.env.LINE_PAY_SITE;

const router: Router = Router();
if (!LINE_PAY_CHANNEL_ID || !LINE_PAY_CHANNEL_SECRET || !LINE_PAY_SITE) {
  throw new Error('Missing required LINE PAY environment variables');
}

const LinePayService = {
  generateSignature(uri: string, body: object, nonce: string): string {
    const bodyString = JSON.stringify(body);
    const data = `${LINE_PAY_CHANNEL_SECRET}${uri}${bodyString}${nonce}`;
    return crypto
      .createHmac('sha256', LINE_PAY_CHANNEL_SECRET)
      .update(data)
      .digest('base64');
  },
  router: router
};

router.post('/linepay/request', async (req: Request, res: Response) => {
  try {
    const amount: number = Number(req.body.amount);
    const productName: string = req.body.productName || 'WanTrip 行程';
    
    const uri = '/v3/payments/request';
    const nonce = uuidv4();
    const orderId = `WT${Date.now()}`;

    const body: LinePayRequestBody = {
      amount: amount,
      currency: 'TWD',
      orderId: orderId,
      packages: [
        {
          id: `PKG_${orderId}`,
          amount: amount,
          products: [
            {
              name: productName,
              quantity: 1,
              price: amount
            }
          ]
        }
      ],
      redirectUrls: {  
        confirmUrl: process.env.LINE_PAY_CONFIRM_URL || 'http://localhost:5173/orders/completed',  
        cancelUrl: process.env.LINE_PAY_CANCEL_URL || 'http://localhost:5173/orders/checkout'  
      }  
    };

    const signature = LinePayService.generateSignature(uri, body, nonce);

    console.log(`[LINE Pay Request] OrderId: ${orderId}, Amount: ${amount}`);

    const response = await axios.post(`${LINE_PAY_SITE}${uri}`, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature
      }
    });

    res.json(response.data);

  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('--- LINE Pay API Error ---', axiosError.response?.data || axiosError.message);
    res.status(400).json(axiosError.response?.data || { message: 'Internal Server Error' });
  }
});

router.post('/linepay/confirm', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.body;
    const amount: number = Number(req.body.amount);

    const uri = `/v3/payments/${transactionId}/confirm`;
    const nonce = uuidv4();
    const body: ConfirmBody = { amount, currency: 'TWD' };

    const signature = LinePayService.generateSignature(uri, body, nonce);

    const response = await axios.post(`${LINE_PAY_SITE}${uri}`, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature
      }
    });

    console.log(`[LINE Pay Confirm] Success: ${transactionId}`);
    res.json(response.data);

  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('--- LINE Pay Confirm Error ---', axiosError.response?.data || axiosError.message);
    res.status(400).json(axiosError.response?.data || { message: 'Confirm Failed' });
  }
});

export default LinePayService;