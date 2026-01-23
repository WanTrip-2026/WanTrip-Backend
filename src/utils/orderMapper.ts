export const mapToOrderDbSchema = (frontendPayload: any) => {
  return {
    user_id: frontendPayload.user_id || frontendPayload.userId,
    order_id: frontendPayload.order_id || frontendPayload.orderId,
    hotel_name: frontendPayload.hotelName || frontendPayload.title,
    room_type: frontendPayload.roomType || frontendPayload.subtitle,
    check_in_date:
      frontendPayload.checkInDate ||
      (frontendPayload.date ? frontendPayload.date.split(" ")[0] : null),
    check_out_date: frontendPayload.checkOutDate,
    price: frontendPayload.orderAmount || frontendPayload.price,
    status: "訂購完成", // Default to completed since we map this after payment
    contact_name: frontendPayload.userInfo?.name,
    contact_email: frontendPayload.userInfo?.email,
    contact_phone: frontendPayload.userInfo?.phone,
    image_url: frontendPayload.image || frontendPayload.image_url,
    hotel_id: frontendPayload.hotel_id || null, // Ensure hotel_id is mapped
    room_id: frontendPayload.room_id || null, // [NEW] Map room_id
    attraction_id: frontendPayload.attraction_id || null,
    created_at: new Date().toISOString(),
  };
};
