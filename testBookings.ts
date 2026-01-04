// testBookings.ts
import { supabase } from "./src/supabase.ts"; // 確認路徑正確

async function testBookings() {
  console.log("=== 開始抓取 bookings 資料 ===");

  try {
    const { data, error } = await supabase.from("profiles").select("*");

    // debug: 顯示 raw data 與 error
    console.log("Supabase 回傳的 raw data:", data);
    console.log("Supabase 回傳的 error:", error);

    if (error) {
      console.error("Supabase 查詢失敗：", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.warn("注意：bookings 表沒有資料！");
      return;
    }

    console.log("=== Bookings 資料如下 ===");
    console.table(data); // 表格輸出，方便查看每一筆資料
  } catch (err) {
    console.error("程式執行錯誤:", err);
  }

  console.log("=== 測試結束 ===");
}

testBookings();
