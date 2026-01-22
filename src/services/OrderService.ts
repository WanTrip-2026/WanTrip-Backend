import { tempOrderStorage } from "./TempOrderStore.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { mapToOrderDbSchema } from "../utils/orderMapper.js";

export const OrderService = {
  /**
   * Processes a successful payment notification.
   * Finds the pending order in temp storage, creates it in the DB (or updates status if exists),
   * and cleans up storage.
   */
  async processPaymentSuccess(orderId: string, amount?: number) {
    console.log(
      `[OrderService] Processing payment success for Order ID: ${orderId}`,
    );

    // 1. Check if order already exists in DB (Idempotency)
    const { data: existingOrder } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("order_id", orderId)
      .single();

    if (existingOrder) {
      console.log(`[OrderService] Order ${orderId} already exists in DB.`);
      if (
        existingOrder.status !== "completed" &&
        existingOrder.status !== "訂購完成"
      ) {
        console.log(`[OrderService] Updating status to completed.`);
        await supabaseAdmin
          .from("orders")
          .update({ status: "completed" })
          .eq("order_id", orderId);
      }
      // Clean up temp storage just in case
      tempOrderStorage.delete(orderId);
      return { success: true, orderId: existingOrder.id, isNew: false };
    }

    // 2. If not in DB, retrieve from temp storage
    const pendingOrder = tempOrderStorage.get(orderId);

    if (!pendingOrder) {
      console.warn(
        `[OrderService] No pending order found in temp storage for ${orderId}`,
      );
      // If we provided an amount but lost the payload, we might be stuck.
      // But usually we need the full payload to create the order.
      return {
        success: false,
        message: "Order payload not found and order does not exist.",
      };
    }

    console.log(
      `[OrderService] Found pending order payload. Creating new order...`,
    );
    // console.log(`[DEBUG] User ID: ${pendingOrder.user_id}`);

    // 3. Create new order
    const safePayload = mapToOrderDbSchema(pendingOrder);

    // Ensure amount matches if provided (double check)
    if (amount && safePayload.price !== amount) {
      console.warn(
        `[OrderService] Amount mismatch! Stored: ${safePayload.price}, Paid: ${amount}. Using Stored.`,
      );
    }

    const { error, data } = await supabaseAdmin
      .from("orders")
      .insert(safePayload)
      .select()
      .single();

    if (error) {
      console.error("[OrderService] Failed to create order:", error);
      return { success: false, message: error.message };
    }

    console.log(
      `[OrderService] Order created successfully via Supabase. ID: ${data?.id}`,
    );

    // 4. Cleanup
    tempOrderStorage.delete(orderId);

    return { success: true, orderId: data?.id, isNew: true };
  },
};
