import { supabaseAdmin } from "./supabaseAdmin.js";

interface OrderPayload {
  hotel_id?: string;
  room_id?: string;

  // 你已經在 payload 有 checkInDate/checkOutDate（前端 createOrderPayload 會送）
  checkInDate?: string; // YYYY-MM-DD
  checkOutDate?: string; // YYYY-MM-DD

  // 前端 peopleNum 其實是「房間數」
  peopleNum?: number; // roomsQty
  quantity?: number; // roomsQty (建議統一用 quantity)

  // 前端送的金額/單價都不信任，只拿來做 UX 比對或 log
  price?: number;
  orderAmount?: number;

  coupon?: string; // 建議前端也一起送 form.coupon（需要前端補上）
  type?: string;
}

function parseYMD(s: string): Date | null {
  // 用 UTC 方式避免時區造成日期偏移
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function diffNights(checkIn: string, checkOut: string): number | null {
  const a = parseYMD(checkIn);
  const b = parseYMD(checkOut);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  // 必須 checkOut > checkIn
  if (ms <= 0) return null;
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : null;
}

function calcLongStayDiscount(subtotal: number, nights: number): number {
  if (nights >= 6) return Math.round(subtotal * 0.2);
  if (nights >= 4) return Math.round(subtotal * 0.15);
  if (nights >= 2) return Math.round(subtotal * 0.1);
  return 0;
}

function calcLongStayDiscountMatchesFrontend(
  subtotal: number,
  nights: number,
): number {
  return 0;
}

function calcCouponDiscount(
  codeRaw: string | undefined,
  subtotalAfterStay: number,
): number {
  const code = (codeRaw ?? "").trim().toUpperCase();
  if (!code) return 0;
  if (code === "WANTRIP200") {
    // 不允許折扣 > 應付
    return Math.min(200, subtotalAfterStay);
  }
  return 0;
}

export const OrderValidator = {
  async validateOrder(payload: OrderPayload): Promise<{
    isValid: boolean;
    message?: string;

    // ✅ 回傳後端算出的真實金額，給你 payment router 使用
    pricing?: {
      roomsQty: number;
      nights: number;
      unitPrice: number;
      subtotal: number;
      longStayDiscount: number;
      couponDiscount: number;
      total: number;
      couponCode?: string;
      clientTotal?: number;
    };
  }> {
    if (payload.type !== "hotel") return { isValid: true };

    // 1) 必填
    if (!payload.hotel_id) return { isValid: false, message: "缺少 hotel_id" };
    if (!payload.room_id) {
      return { isValid: false, message: "缺少 room_id" };
    }
    if (!payload.checkInDate || !payload.checkOutDate) {
      return { isValid: false, message: "缺少入住/退房日期" };
    }

    const nights = diffNights(payload.checkInDate, payload.checkOutDate);
    if (!nights) return { isValid: false, message: "日期區間不正確" };

    // Note: User said "peopleNum is actually roomsQty??".
    // In frontend: peopleConfig.rooms = rooms. peopleConfig.people = adults.
    // payload.quantity defaults to peopleConfig.people?
    // Let's trust payload.quantity if exists (from simplify step).
    const roomsQty = Math.max(
      1,
      Number(payload.quantity ?? payload.peopleNum ?? 1) || 1,
    );

    // 2) 查 DB 房型（DB 才是真相）
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .select("id, price, guest_capacity")
      .eq("id", payload.room_id)
      .single();

    if (error || !room) return { isValid: false, message: "找不到指定的房型" };

    const unitPrice = Number(room.price || 0);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { isValid: false, message: "房價資料異常" };
    }

    // 3) 後端計價（唯一真相）

    const subtotal = unitPrice * roomsQty * nights;

    // Using 0 discount to match frontend removal of long-stay
    const longStayDiscount = calcLongStayDiscountMatchesFrontend(
      subtotal,
      nights,
    );

    const afterStay = Math.max(subtotal - longStayDiscount, 0);
    const couponDiscount = calcCouponDiscount(payload.coupon, afterStay);
    const total = Math.max(afterStay - couponDiscount, 0);

    // 4) 庫存檢查（建議 fail closed）
    const { data: availData, error: rpcError } = await supabaseAdmin.rpc(
      "get_room_availability",
      {
        p_hotel_id: payload.hotel_id,
        p_start_date: payload.checkInDate,
        p_end_date: payload.checkOutDate,
      },
    );

    if (rpcError) {
      return { isValid: false, message: "庫存查詢失敗，請稍後再試" };
    }

    const targetAvail = ((availData as any[]) || []).find(
      (r: any) => r.room_id === room.id,
    );
    const availableQty = targetAvail
      ? Number(targetAvail.min_available || 0)
      : 0;

    if (availableQty < roomsQty) {
      return {
        isValid: false,
        message: `該時段房型已售完或庫存不足 (剩餘: ${availableQty})`,
      };
    }

    // 6) 可選：只做 UX 比對（不當作真實依據）
    const clientTotal = Number(payload.orderAmount ?? NaN);

    // Allow strict math check?
    // If frontend calculated WITHOUT nights, and we calc WITH nights, this will fail for >1 night stays.
    // Let's assume user wants to fix frontend eventually, so backend should be "Correct".

    if (Number.isFinite(clientTotal) && Math.abs(clientTotal - total) > 1) {
      // 建議直接擋
      return {
        isValid: false,
        message: `金額已更新 (系統: ${total}, 提交: ${clientTotal})，請重新確認`,
        pricing: {
          roomsQty,
          nights,
          unitPrice,
          subtotal,
          longStayDiscount,
          couponDiscount,
          total,
          couponCode: payload.coupon?.trim().toUpperCase() || undefined,
          clientTotal,
        },
      };
    }

    return {
      isValid: true,
      pricing: {
        roomsQty,
        nights,
        unitPrice,
        subtotal,
        longStayDiscount,
        couponDiscount,
        total,
        couponCode: payload.coupon?.trim().toUpperCase() || undefined,
        clientTotal: Number.isFinite(clientTotal) ? clientTotal : undefined,
      },
    };
  },
};
