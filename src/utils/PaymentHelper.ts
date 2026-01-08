import crypto from 'crypto';

/**
 * 產生綠界全方位支付 AIO 的 CheckMacValue
 * 嚴格遵循綠界字母排序與特定符號取代規則
 */
export function generateCheckMacValue(params: Record<string, any>, hashKey: string, hashIV: string): string {
  // 1. 排序並組合字串
  const sortedKeys = Object.keys(params).sort();
  let rawString = `HashKey=${hashKey}&`;
  
  for (const key of sortedKeys) {
    // 綠界規定 CheckMacValue 不包含 CheckMacValue 本身
    if (key !== 'CheckMacValue') {
      rawString += `${key}=${params[key]}&`;
    }
  }
  
  rawString += `HashIV=${hashIV}`;

  // 2. URL Encode
  // 綠界要求：使用 .toLowerCase() 並且將特定符號轉為符合規範的字元
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

  // 3. SHA256 加密並轉大寫
  return crypto.createHash('sha256').update(urlEncoded).digest('hex').toUpperCase();
}