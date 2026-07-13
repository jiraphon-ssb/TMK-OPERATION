/* ============================================================
   tables.js — ชื่อตารางชั้น Sale ที่เดียว (กัน drift ระหว่าง query / realtime subscribe / invalidate)
   เดิมเป็น string literal ลอย 50+ จุด → พิมพ์ผิด/ไม่ตรงกันเงียบ ๆ ได้
   ============================================================ */
export const T = {
  mpOrders: 'tmk_mp_orders',
  mpSkus: 'tmk_mp_skus',
  mpCustomers: 'tmk_mp_customers',
  saleReceipts: 'tmk_sale_receipts',
  salesFunnel: 'tmk_sales_funnel',
  orderOverrides: 'tmk_order_overrides',
  skuOverrides: 'tmk_sku_overrides',
};
