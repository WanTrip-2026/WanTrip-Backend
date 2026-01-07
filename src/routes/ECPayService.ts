import crypto from 'crypto';
import axios, { AxiosError } from 'axios';

interface OrderInfo {
  MerchantTradeNo: string;
  MerchantTradeDate: string;
  TotalAmount: number;
  ReturnURL: string;
  TradeDesc: string;
  ItemName: string;
}

interface ConsumerInfo {
  MerchantMemberID: string;
}

interface EcpayTradeData {
  MerchantID: string;
  RememberCard: number;
  PaymentType: string;
  OrderInfo: OrderInfo;
  ConsumerInfo: ConsumerInfo;
}

const MERCHANT_ID = '2000132';
const HASH_KEY = '5294y06JbCWpE5vM';
const HASH_IV = 'v77hoKGq4kWxJvUe';
const ECPAY_API_URL = 'https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyTrade';

function encryptEcpayData(data: string): string {
  const cipher = crypto.createCipheriv('aes-128-cbc', HASH_KEY, HASH_IV);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function getFormattedTradeDate(): string {
  const date = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export const getEcpayToken = async (amount: number, tradeNo: string): Promise<any> => {
  const tradeData: EcpayTradeData = {
    MerchantID: MERCHANT_ID,
    RememberCard: 1,
    PaymentType: 'CARD',
    OrderInfo: {
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: getFormattedTradeDate(),
      TotalAmount: amount,
      ReturnURL: 'https://your-api.com/callback',
      TradeDesc: 'WanTrip訂單',
      ItemName: '旅遊行程費用'
    },
    ConsumerInfo: {
      MerchantMemberID: 'User' + Date.now(),
    }
  };

  const encryptedData: string = encryptEcpayData(JSON.stringify(tradeData));

  const apiPayload = {
    MerchantID: MERCHANT_ID,
    RqHeader: {
      Timestamp: Math.floor(Date.now() / 1000)
    },
    RqData: encryptedData 
  };

  try {
    const response = await axios.post(ECPAY_API_URL, apiPayload);

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('❌ 綠界 API 請求失敗:', axiosError.response?.data || axiosError.message);
    throw axiosError;
  }
};