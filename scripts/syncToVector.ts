import * as dotenv from "dotenv";
import path from "path";

// 強制指定 .env 的路徑
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// --- 偵錯測試：如果這裡印出 undefined，代表 .env 檔案位置真的錯了 ---
console.log("讀取到的 URL:", process.env.SUPABASE_URL);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("找不到環境變數，請檢查 .env 檔案內容與位置");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function fetchAllData(tableName: string, selectQuery: string) {
  let allData: any[] = [];
  let from = 0;
  let to = 999;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectQuery)
      .range(from, to)
      .order("id"); // 排序確保分頁抓取不會重複

    if (error) throw error;
    if (data.length > 0) {
      allData = [...allData, ...data];
      from += 1000;
      to += 1000;
    } else {
      hasMore = false;
    }
    // 如果回傳數量少於 1000，代表沒下一頁了
    if (data.length < 1000) hasMore = false;
  }
  return allData;
}

// --- 在 syncData 裡這樣用 ---
async function syncData() {
  console.log("正在抓取完整的飯店資料...");
  const hotels = await fetchAllData(
    "hotels",
    "id, name, description, city, district, star_rating, min_price"
  );

  console.log("正在抓取完整的票券資料...");
  const attractions = await fetchAllData(
    "attractions",
    "id, name, description, detail, city, category, highlights"
  );

  const allItems = [
    ...(hotels?.map((h) => ({
      source_id: h.id,
      source_type: "hotel",
      title: h.name,
      // 拼接描述，讓 AI 更好搜尋
      text: `飯店名稱：${h.name}。位於${h.city}${h.district}。星級：${h.star_rating}星。價格約${h.min_price}起。特色：${h.description}`,
    })) || []),
    ...(attractions?.map((a) => ({
      source_id: a.id,
      source_type: "attraction",
      title: a.name,
      text: `景點/票券：${a.name}。類別：${a.category}。地點：${a.city}。特色：${a.highlights}。詳情：${a.description}`,
    })) || []),
  ];

  console.log(`準備處理 ${allItems.length} 筆資料...`);

  // --- 3. 分批處理 (每 50 筆一組) 以節省 Token 與避免超限 ---
  for (let i = 0; i < allItems.length; i += 50) {
    const batch = allItems.slice(i, i + 50);

    // 呼叫 OpenAI Embedding
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch.map((item) => item.text),
    });

    const rowsToInsert = batch.map((item, index) => ({
      source_id: item.source_id,
      source_type: item.source_type,
      title: item.title,
      content: item.text,
      embedding: embeddingRes.data[index].embedding,
      metadata: { synced_at: new Date().toISOString() },
    }));

    // 存入剛才建好的 travel_contents 表
    const { error } = await supabase
      .from("travel_contents")
      .insert(rowsToInsert);
    if (error) console.error("插入失敗:", error);

    console.log(`已完成 ${i + batch.length} / ${allItems.length}`);
  }
}

syncData();
