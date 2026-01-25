import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages }: { messages: ChatMessage[] } = await req.json();
    // 獲取最後兩則對話，並合併成搜尋字串
    const lastTwoMessages = messages
      .filter((m) => m.role === "user")
      .slice(-2) // 取最後兩次
      .map((m) => m.content)
      .join(" ");

    console.log("--- [DEBUG] 1. 強化搜尋字串:", lastTwoMessages);

    // 【修正點】先初始化變數，才能給下面使用
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

    console.log("--- [DEBUG] 2. 開始 Embedding...");
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: lastTwoMessages, // 用合併後的字串去搜尋
    });
    const [{ embedding }] = embeddingRes.data;
    console.log("--- [DEBUG] 3. Embedding 完成");

    console.log("--- [DEBUG] 4. 開始資料庫 RPC 檢索...");
    const { data: matchedContext, error: rpcError } = await supabase.rpc(
      "match_travel_contents",
      {
        query_embedding: embedding,
        match_threshold: 0.2,
        match_count: 20,
      }
    );

    if (rpcError) {
      console.error("--- [DEBUG] RPC 錯誤:", rpcError);
      throw rpcError;
    }
    console.log("--- [DEBUG] 5. 檢索完成，找到筆數:", matchedContext?.length);

    // 格式化參考內容
    const contextText =
      matchedContext
        ?.map(
          (item: { source_type: string; title: string; content: string }) =>
            `- [${item.source_type}] ${item.title}: ${item.content}`
        )
        .join("\n") || "未找到相關飯店或景點資料";

    console.log("--- [DEBUG] 6. 開始呼叫 GPT-4o-mini...");
    const completionMessages = [
      {
        role: "system",
        content: `你是一個專業且親切的台灣旅遊管家。
            請根據提供的資料庫內容來推薦飯店住宿或景點或票券。
            當使用者詢問『票券』時，請從資料庫中尋找相關票券或景點資訊提供給使用者。
            當使用者詢問『飯店』或是『住宿』時，請從資料庫中尋找相關飯店資訊提供給使用者。


            【回答規則】：
            1. 語氣要像在 Line 或一般聊天室對話，親切自然。
            2. ❌ 嚴禁使用 Markdown 格式（例如：不要用 **重點**、## 標題、### 小標）。
            3. 你回覆的內容如果比較長，可以適度換行。
            4. 推薦內容至少3~5個，最多5個，除非不到3個，就看有幾個回答幾個。
            5. 當使用者詢問『還有嗎』之類的想要詢問更多推薦時，請嚴格檢查參考資料中剩餘的內容。
            6. 若使用者以某個縣市或地區來詢問，請只推薦該縣市或地區的內容。例如使用者詢問台北有什麼票券，請只回答台北有的票券。
            7. 如果有多項推薦可用列點的形式，但是每一點結束後需換行。例如：『1.士林夜市，這裡有...（換行）2.北投溫泉...』。
            8. 僅限回答資料庫中有的內容，請誠實告知，不要編造。
            9. 【拒絕策略】：
                - 嚴禁提及「資料庫」、「檢索」、「搜尋」或「系統」等技術字眼。
                - 當找不到資料時，請以「平台客服」的口吻表示遺憾。
                - 統一使用：「抱歉，我們目前沒有提供 [使用者提到的地點/飯店] 的相關資訊。」
                - 隨後必須接上一句親切的引導，例如：「如果您想看看其他熱門景點或飯店推薦，隨時都可以問我喔！」
            10. 一律使用繁體中文。

            【重要】：
            當使用者詢問『還有嗎』或要求更多推薦時，請務必從參考資料中尋找尚未提及過的項目。資料庫中可能包含多個景點，請盡可能提供不同於前一次回覆的內容，直到所有相關參考資料都介紹完畢為止。

            參考資料：\n${contextText}`,
      },
      ...messages,
    ];

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: completionMessages, // 使用包含記憶的陣列
      temperature: 0.7,
    });

    const answer = chatCompletion.choices[0].message.content;
    console.log("--- [DEBUG] 7. AI 回答生成成功");

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("--- [DEBUG] 發生錯誤:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
