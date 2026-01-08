import crypto from 'crypto';

// 配置資訊
const ECPAY_CONFIG = {
  MerchantID: process.env.ECPAY_MERCHANT_ID || '2000132',
  HashKey: process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9',
  HashIV: process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxJt9M',
  ApiURL: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
};

/**
 * 核心加密函式：產生 CheckMacValue
 */
export const generateCheckMacValue = (params: Record<string, any>): string => {
  const sortedKeys = Object.keys(params).sort();
  let rawString = `HashKey=${ECPAY_CONFIG.HashKey}&`;
  
  for (const key of sortedKeys) {
    if (key !== 'CheckMacValue') {
      rawString += `${key}=${params[key]}&`;
    }
  }
  rawString += `HashIV=${ECPAY_CONFIG.HashIV}`;

  const urlEncoded = encodeURIComponent(rawString)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');

  return crypto.createHash('sha256').update(urlEncoded).digest('hex').toUpperCase();
};

/**
 * 準備結帳參數
 */
export const getAioCheckoutParams = (amount: number, tradeNo: string) => {
  const date = new Date();
  const tradeDate = date.toLocaleString('zh-TW', { 
    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  }).replace(/-/g, '/');

  const baseParams = {
    MerchantID: ECPAY_CONFIG.MerchantID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: amount,
    TradeDesc: 'WanTrip_Booking',
    ItemName: 'WanTrip_Travel_Package',
    ReturnURL: process.env.ECPAY_RETURN_URL || 'https://your-api.com/api/payment/callback',
    ChoosePayment: 'ALL',
    EncryptType: '1',
    ClientBackURL: 'http://localhost:5173/payment/result',
  };

  return {
    ...baseParams,
    CheckMacValue: generateCheckMacValue(baseParams),
    actionUrl: ECPAY_CONFIG.ApiURL
  };
};

/**
 * 驗證回傳的檢查碼是否正確
 */
export const verifyCheckMacValue = (payload: any): boolean => {
  const { CheckMacValue, ...params } = payload;
  const computedValue = generateCheckMacValue(params);
  return CheckMacValue === computedValue;
};