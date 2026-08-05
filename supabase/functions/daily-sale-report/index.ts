// ============================================================
//  TMK — daily-sale-report  (Supabase Edge Function, Deno)
// ============================================================
//  สรุปยอดขาย "รายวัน" ส่งเข้า LINE (เที่ยง 12:00 / เย็น 17:00 / สิ้นวัน 22:00)
//  - เรียกโดย pg_cron ผ่าน pg_net (ดู migration 20260803-daily-report-cron.sql)
//  - ไม่มี user session (cron) → ป้องกันด้วย CRON_SECRET (header x-cron-secret)
//  - อ่าน DB ด้วย service role (bypass RLS) เหมือน line-broadcast/ai-extract
//  - โครงข้อความ = Flex "carousel" เลื่อนซ้าย-ขวา (กันชนลิมิต LINE · แต่ละใบเล็ก-อ่านง่าย):
//      ใบ 1: ยอดขายทีม + คนทัก + ช่องทาง       (สูตรตรงการ์ดทีม salePerf.jsx)
//      ใบ 2: CRM รายเซลล์ (CRM_SELLER เช่น FAH) รายงานเต็มแบบ PART 91 (crmDailyNote.js)
//  - ส่งแบบ push ไป LINE_TARGET_ID เท่านั้น — *ไม่* broadcast (กันยอดรั่วถึงลูกค้า)
//
//  ลิมิต LINE ที่ออกแบบรอบ: push ≤5 ก้อน · flex 1 ข้อความ ≤50KB · carousel ≤12 ใบ · text ≤5000 ตัว
//
//  Deploy:  supabase functions deploy daily-sale-report --no-verify-jwt
//  Secrets: LINE_CHANNEL_ACCESS_TOKEN · LINE_TARGET_ID · CRON_SECRET
//           CRM_SELLER (เช่น FAH · ว่าง=ไม่มีใบ CRM) · LOGO_URL · REPORT_FORMAT
//  ทดสอบเอง: curl -X POST "<url>?slot=noon&dry=1&key=<CRON_SECRET>"
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// ---- วันที่ตามเวลาไทย (UTC+7) — cron รันเป็น UTC ต้องบวกเอง ----
function bkkToday(): string {
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return t.toISOString().slice(0, 10); // YYYY-MM-DD
}
const baht = (n: number) => "฿ " + Math.round(Number(n) || 0).toLocaleString("en-US"); // เว้นวรรคหลัง ฿ ให้ตรงกับการ์ด Flex
const N = (v: unknown) => Number(v) || 0;

// ---- override merge (พอร์ตจาก src/lib/saleOverrides.js เฉพาะฟิลด์ที่กระทบ KPI) ----
const OV_KEY = (o: any) => `${o.source || ""}:${o.order_no}`;
const _num = (a: any, b: any) => (a != null && a !== "" ? Number(a) : b);
const _str = (a: any, b: any) => (a != null && a !== "" ? a : b);
function mergeOv(orders: any[], ovMap: Record<string, any>) {
  if (!Object.keys(ovMap).length) return orders;
  return orders.map((o) => {
    const ov = ovMap[OV_KEY(o)];
    if (!ov) return o;
    return {
      ...o,
      salesperson: ov.salesperson || o.salesperson,
      channel: _str(ov.channel, o.channel), // CRM นิยามด้วย channel → ต้อง merge ด้วย
      payment_type: _str(ov.payment_type, o.payment_type),
      customer_type: ov.customer_type || o.customer_type,
      customer_code: _str(ov.customer_code, o.customer_code),
      customer_name: _str(ov.customer_name, o.customer_name),
      sales: _num(ov.sales, o.sales),
      qty: _num(ov.qty, o.qty),
      cod_amount: _num(ov.cod_amount, o.cod_amount),
      order_date: _str(ov.order_date, o.order_date),
    };
  });
}

const isCancelled = (o: any) => String(o.status || "").toLowerCase() === "cancelled";
const isCod = (o: any) => o.payment_type === "COD" || (Number(o.cod_amount) || 0) > 0;
// ช่องมาร์เก็ตเพลส/หน้าร้าน — ไม่มี "คนทัก" → ตัดจากตัวตั้ง %ปิด (ตรง src/lib/saleFields.js · PART 89)
const MARKETPLACE = ["Shopee", "Lazada", "POS"];
const isLeadChannel = (ch: any) => !!ch && !MARKETPLACE.includes(ch);

// ---- ประเภทงาน DFT (พอร์ตจาก src/lib/saleData.js — หมายเหตุเป็นเจ้าของ) ----
const DFT_RE = /\bdft\b/i;
function resolveJobType(jobType: any, note: any) {
  const jt = jobType === "ส่ง" ? "ปลีก" : (jobType || "ปลีก");
  const hasDft = DFT_RE.test(String(note || ""));
  if (jt === "ปลีก" && hasDft) return "DFT";
  if (jt === "DFT" && !hasDft) return "ปลีก";
  return jt;
}
const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ---- CRM helpers (พอร์ตจาก crmAgg.js + crmDailyNote.js) ----
const isMasked = (v: any) => /\*{2,}/.test(String(v || ""));
function crmKey(o: any) {
  if (isMasked(o.customer_name) || isMasked(o.customer_code)) return "";
  const c = String(o.customer_code || "").trim(); if (c) return c;
  const n = String(o.customer_name || "").trim(); return n ? "N" + n.slice(0, 60) : "";
}
// เติมช่องบันทึกประจำวันให้ครบโครง (data เก่า/บางส่วน → ไม่พัง)
function normNoteData(d: any) {
  const c = (d && d.calls) || {};
  const g = (x: any) => ({ total: N(x?.total), answered: N(x?.answered) });
  return {
    calls: { d0: g(c.d0), d5: g(c.d5), rep: g(c.rep) },
    upsellOrders: N(d?.upsellOrders), upsellBaht: N(d?.upsellBaht),
    freebieOrders: N(d?.freebieOrders), birthdayOrders: N(d?.birthdayOrders),
    ask: String(d?.ask || ""), praise: String(d?.praise || ""), complaint: String(d?.complaint || ""),
  };
}

// ============================================================
//  สีตามดีไซน์เว็บ (src/index.css)
// ============================================================
const C = {
  ink: "#09090B", ink2: "#3F3F46", ink3: "#71717A", ink4: "#A1A1AA",
  border: "#E4E4E7", surface2: "#F4F4F5", accentSoft: "#EEEDFC", // --accent-soft (บล็อก hero)
  accent2: "#4338CA", good: "#16A34A", warn: "#CA8A04", bad: "#DC2626", white: "#FFFFFF",
};
const B = (n: number) => "฿ " + Math.round(n).toLocaleString("en-US"); // เว้นวรรคหลัง ฿ — ฟอนต์ LINE เบียดเลข

// ---- ชิ้นส่วนการ์ด (module scope · ใช้ร่วมทั้ง 2 ใบ) ----
const card = (label: string, val: string, color: string, sz = "md") => ({
  type: "box", layout: "vertical", flex: 1,
  borderWidth: "1px", borderColor: C.border, cornerRadius: "12px",
  paddingAll: "12px", backgroundColor: C.white, spacing: "none",
  contents: [
    { type: "text", text: label, size: "xs", color: C.ink3 },
    { type: "text", text: val, size: sz, weight: "bold", color, margin: "sm" },
  ],
});
const kvRow = (label: string, val: string, vc = C.ink) => ({
  type: "box", layout: "horizontal", contents: [
    { type: "text", text: label, size: "sm", color: C.ink3, flex: 5 },
    { type: "text", text: val, size: "sm", weight: "bold", color: vc, align: "end", flex: 6 },
  ],
});
// hero = ตัวเลขชูโรงบนบล็อกสีจาง (--accent-soft) — เฟี้ยวด้วย layout คงสีเว็บ
const heroBlock = (label: string, val: string, color = C.accent2, sz = "xxl") => ({
  type: "box", layout: "vertical", flex: 1, backgroundColor: C.accentSoft,
  cornerRadius: "12px", paddingAll: "14px", spacing: "none",
  contents: [
    { type: "text", text: label, size: "xs", color: C.ink3 },
    { type: "text", text: val, size: sz, weight: "bold", color, margin: "sm" },
  ],
});
const tile = (label: string, val: string, color = C.ink) => ({
  type: "box", layout: "vertical", flex: 1, borderWidth: "1px", borderColor: C.border,
  cornerRadius: "12px", paddingAll: "8px", contents: [
    { type: "text", text: label, size: "xxs", color: C.ink3, align: "center" },
    { type: "text", text: val, size: "sm", weight: "bold", color, align: "center", margin: "xs" },
  ],
});
// สี %ปิด ตามเกณฑ์เว็บ (saleDashboard): ≥15 ดี · ≥8 กลาง · ต่ำกว่า = แย่
const closeTone = (r: number) => (r >= 15 ? C.good : r >= 8 ? C.warn : C.bad);
const progressBar = (pct: number) => ({
  type: "box", layout: "vertical", backgroundColor: C.surface2, cornerRadius: "3px", height: "6px", margin: "sm",
  contents: [{ type: "box", layout: "vertical", backgroundColor: pct >= 100 ? C.good : C.accent2, cornerRadius: "3px", height: "6px", width: Math.max(2, Math.min(100, Math.round(pct))) + "%", contents: [{ type: "filler" }] }],
});
const headerRow = (head: string, sub: string) => {
  const logoUrl = Deno.env.get("LOGO_URL") || "";
  return {
    type: "box", layout: "horizontal", spacing: "md", contents: [
      ...(logoUrl ? [{ type: "image", url: logoUrl, size: "44px", aspectRatio: "1:1", aspectMode: "fit", flex: 0, gravity: "center" }] : []),
      { type: "box", layout: "vertical", spacing: "xs", justifyContent: "center", contents: [
        { type: "text", text: head, size: "lg", weight: "bold", color: C.ink },
        { type: "text", text: sub, size: "xs", color: C.ink3 },
      ] },
    ],
  };
};

// ============================================================
//  ใบ 1 — ยอดขายทีม + คนทัก + ช่องทาง
// ============================================================
function buildMainBubble(m: any) {
  const [yy, mm, dd] = m.day.split("-").map(Number);
  const dateTh = `${dd} ${TH_MON[mm]} ${yy + 543}`;
  const head = m.slot === "night" ? "สรุปยอด 22:00 น." : m.slot === "evening" ? "สรุปยอด 17:00 น." : m.slot === "noon" ? "สรุปยอด 12:00 น." : "สรุปยอดประจำวัน";
  const tf = m.transfer > 0 ? { v: B(m.transfer), c: C.good } : { v: "—", c: C.ink4 };
  const cd = m.cod > 0 ? { v: B(m.cod), c: C.warn } : { v: "—", c: C.ink4 };
  const numCell = (n: number, flexN: number) =>
    ({ type: "text", text: n > 0 ? String(n) : "—", size: "sm", weight: "bold", color: n > 0 ? C.ink : C.ink4, align: "end", flex: flexN });
  const platHeader = { type: "box", layout: "horizontal", contents: [
    { type: "text", text: "ช่องทาง", size: "xxs", color: C.ink3, flex: 3 },
    { type: "text", text: "ใหม่", size: "xxs", color: C.ink3, align: "end", flex: 2 },
    { type: "text", text: "เก่า", size: "xxs", color: C.ink3, align: "end", flex: 2 },
    { type: "text", text: "ยอดขาย", size: "xxs", color: C.ink3, align: "end", flex: 3 },
  ] };
  const platRows = ["Facebook", "LINE", "Phone", "POS", "Others"].map((p) => {
    const g = (m.chLeads || {})[p] || { nw: 0, od: 0, unk: 0 };
    const s = (m.chSales || {})[p] || 0;
    return { type: "box", layout: "horizontal", contents: [
      { type: "text", text: p, size: "sm", color: C.ink3, flex: 3 },
      numCell(g.nw, 2), numCell(g.od, 2),
      { type: "text", text: s > 0 ? B(s) : "—", size: "sm", weight: "bold", color: s > 0 ? C.ink : C.ink4, align: "end", flex: 3 },
    ] };
  });

  const bubble: any = {
    type: "bubble",
    styles: { body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "20px", contents: [
      headerRow(head, `TMK Operation · ${dateTh}`),
      { type: "separator", margin: "lg", color: C.border },
      { type: "box", layout: "vertical", margin: "lg", contents: [heroBlock("ยอดขายรวม", B(m.sales), C.accent2, "xxl")] },
      { type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [card("ยอดโอน", tf.v, tf.c), card("ยอด COD", cd.v, cd.c)] },
      { type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [card("ออเดอร์", `${m.nOrders}`, C.ink), card("จำนวนตัว", `${m.qty}`, C.ink)] },
      { type: "separator", margin: "lg", color: C.border },
      { type: "text", text: "คนทักของทีม", size: "sm", weight: "bold", color: C.ink, margin: "lg" },
      { type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: [
        tile("ทักรวม", String(m.leads), m.leads > 0 ? C.ink : C.ink4),
        tile("ใหม่", String(m.newLeads), m.newLeads > 0 ? C.good : C.ink4),
        tile("เก่า", String(m.oldLeads), m.oldLeads > 0 ? C.ink : C.ink4),
      ] },
      // %ปิด ย้ายลงแถวล่าง (tile แคบเกิน เลขโดนตัด) — โชว์เต็ม + สีตามเกณฑ์
      { ...kvRow("อัตราปิดการขาย (%ปิด)", m.closeRate != null ? `${m.closeRate.toFixed(1)}%` : "—", m.closeRate != null ? closeTone(m.closeRate) : C.ink4), margin: "md" },
      { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [platHeader, ...platRows] },
      { type: "separator", margin: "lg", color: C.border },
      { type: "box", layout: "vertical", spacing: "sm", margin: "lg", contents: [
        kvRow("Basket/AOV", B(m.aov)),
        kvRow("AVG ตัว/ออเดอร์", fmtAvg(m.avgUnits) + " ตัว"),
        kvRow("งาน DFT", m.nDft > 0 ? `${m.nDft} ออเดอร์ · ${m.qtyDft} ตัว` : "—", m.nDft > 0 ? C.ink : C.ink4),
      ] },
    ] },
  };
  return bubble; // ไม่มีปุ่ม (ตามดีไซน์ที่ตกลง)
}

// ============================================================
//  ใบ 2 — CRM รายเซลล์ (รายงานเต็ม PART 91)
// ============================================================
function buildCrmBubble(m: any) {
  const crm = m.crm, d = crm.data;
  const [yy, mm, dd] = m.day.split("-").map(Number);
  const dateTh = `${dd} ${TH_MON[mm]} ${yy + 543}`;
  const totalCalls = d.calls.d0.total + d.calls.d5.total + d.calls.rep.total;
  const ans = d.calls.d0.answered + d.calls.d5.answered + d.calls.rep.answered;
  const salesVal = crm.orders > 0 ? B(crm.sales) : "—";
  const salesColor = crm.orders > 0 ? C.accent2 : C.ink4;

  const rows: any[] = [
    headerRow(`CRM · ${crm.seller}`, `บันทึกประจำวัน · ${dateTh}`),
    { type: "separator", margin: "lg", color: C.border },
  ];
  // hero คู่: ยอดวันนี้ + %เป้า (ถ้ามีเป้า) · ไม่มีเป้า = ยอดวันนี้เดี่ยวเต็มแถว
  if (crm.target > 0) {
    const pct = crm.mtd / crm.target * 100, diff = crm.mtd - crm.target;
    rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "lg", contents: [
      heroBlock("ยอด CRM วันนี้", salesVal, salesColor, "xl"),
      heroBlock(`เป้า ${TH_MON[mm]}`, `${pct.toFixed(0)}%`, pct >= 100 ? C.good : C.accent2, "xl"),
    ] });
    rows.push(progressBar(pct));
    rows.push(kvRow("สะสม · ส่วนต่าง", `${B(crm.mtd)} · ${diff >= 0 ? "+" : "-"}${B(Math.abs(diff))}`, diff >= 0 ? C.good : C.bad));
  } else {
    rows.push({ type: "box", layout: "vertical", margin: "lg", contents: [heroBlock("ยอด CRM วันนี้", salesVal, salesColor, "xxl")] });
  }
  // LINE / โทร
  rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: [
    card("LINE", crm.line > 0 ? B(crm.line) : "—", crm.line > 0 ? C.good : C.ink4),
    card("โทร", crm.phone > 0 ? B(crm.phone) : "—", crm.phone > 0 ? C.ink : C.ink4),
  ] });
  rows.push({ type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [
    kvRow("ออเดอร์ · ตัว", crm.orders > 0 ? `${crm.orders} ออเดอร์ · ${crm.qty} ตัว` : "—", crm.orders > 0 ? C.ink : C.ink4),
    kvRow("ลูกค้าที่ซื้อ", crm.buyers > 0 ? `${crm.buyers} คน (เก่า ${crm.oldCust} · ใหม่ ${crm.newCust})` : "—", crm.buyers > 0 ? C.ink : C.ink4),
    kvRow("ปิด Repurchase", crm.repurchaseOrders > 0 ? `${crm.repurchaseOrders} ออเดอร์ · ${B(crm.repurchaseBaht)}` : "—", crm.repurchaseOrders > 0 ? C.good : C.ink4),
  ] });
  // การโทร — ครบแต่ย่อ 1 บรรทัด/กลุ่ม
  rows.push({ type: "separator", margin: "lg", color: C.border });
  rows.push({ type: "text", text: "การโทร", size: "sm", weight: "bold", color: C.ink, margin: "lg" });
  const callLine = (label: string, g: any, extra = "") =>
    kvRow(label, g.total > 0 ? `${g.total} สาย (รับ ${g.answered})${extra}` : "—", g.total > 0 ? C.ink : C.ink4);
  rows.push({ type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [
    callLine("0DAY", d.calls.d0, ` · อัพเซลล์ ${d.upsellOrders}${d.upsellBaht > 0 ? " · " + B(d.upsellBaht) : ""}`),
    callLine("5DAY", d.calls.d5),
    callLine("Repurchase", d.calls.rep),
    kvRow("รวมจำนวนสาย", totalCalls > 0 ? `${totalCalls} สาย (รับ ${ans} · ไม่รับ ${totalCalls - ans})` : "—", totalCalls > 0 ? C.ink : C.ink4),
  ] });
  // แถม / วันเกิด
  rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: [
    tile("ออเดอร์แถม", `${d.freebieOrders}`, d.freebieOrders > 0 ? C.ink : C.ink4),
    tile("โปรวันเกิด", `${d.birthdayOrders}`, d.birthdayOrders > 0 ? C.ink : C.ink4),
  ] });
  // เสียงลูกค้า — โชว์เฉพาะช่องที่กรอก · ไม่กรอกเลย = ซ่อนทั้งหัวข้อ
  const voiceRow = (label: string, v: string) => ({ type: "box", layout: "vertical", margin: "sm", contents: [
    { type: "text", text: label, size: "xs", color: C.ink3 },
    { type: "text", text: String(v).trim(), size: "sm", color: C.ink2, wrap: true },
  ] });
  const voices: any[] = [];
  if (d.ask.trim()) voices.push(voiceRow("ลูกค้าถามหา", d.ask));
  if (d.praise.trim()) voices.push(voiceRow("ลูกค้าชม", d.praise));
  if (d.complaint.trim()) voices.push(voiceRow("ลูกค้าติ", d.complaint));
  if (voices.length) {
    rows.push({ type: "separator", margin: "lg", color: C.border });
    rows.push({ type: "text", text: "เสียงลูกค้า", size: "sm", weight: "bold", color: C.ink, margin: "lg" });
    rows.push({ type: "box", layout: "vertical", spacing: "sm", contents: voices });
  }

  return { type: "bubble", styles: { body: { backgroundColor: C.white } },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "20px", contents: rows } };
}

// ============================================================
//  Handler
// ============================================================
Deno.serve(async (req) => {
  try {
    // ---- auth: CRON_SECRET (กัน public ยิงเผา token) ----
    const secret = Deno.env.get("CRON_SECRET");
    const got = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("key");
    if (secret && got !== secret) return json({ error: "unauthorized" }, 401);

    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return json({ error: "ยังไม่ได้ตั้ง secret LINE_CHANNEL_ACCESS_TOKEN" }, 500);
    const target = Deno.env.get("LINE_TARGET_ID");

    const url = new URL(req.url);
    const slot = url.searchParams.get("slot") || "";           // noon | evening | night
    const day = url.searchParams.get("date") || bkkToday();
    const dry = url.searchParams.get("dry") === "1";
    const month = day.slice(0, 7);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- ดึงข้อมูล: ออเดอร์ทั้งเดือนถึงวันนี้ (วันนี้=รายงาน · ทั้งเดือน=CRM สะสม) + เป้า/บันทึก CRM ----
    // หมายเหตุ: เดือนละ ~300-500 แถว ต่ำกว่า cap 1000 ของ PostgREST — โตแตะพันออเดอร์/เดือนต้องเปลี่ยนเป็น paged fetch
    const [ordersRes, ovRes, funnelRes, crmTargetRes, crmNoteRes] = await Promise.all([
      sb.from("tmk_mp_orders")
        .select("order_no,source,salesperson,payment_type,customer_type,qty,sales,cod_amount,order_date,status,channel,job_type,note,customer_code,customer_name")
        .gte("order_date", month + "-01").lte("order_date", day),
      sb.from("tmk_order_overrides").select("*"),
      sb.from("tmk_sales_funnel").select("*").eq("date", day),
      sb.from("tmk_crm_targets").select("salesperson,sales_target").eq("month", month),
      sb.from("tmk_crm_notes").select("salesperson,note,data").eq("date", day),
    ]);
    if (ordersRes.error) return json({ error: "อ่านออเดอร์ไม่ได้: " + ordersRes.error.message }, 500);

    const ovMap: Record<string, any> = {};
    (ovRes.data || []).forEach((x: any) => { ovMap[x.order_id] = x; });
    const monthOrders = mergeOv(ordersRes.data || [], ovMap)
      .filter((o) => !isCancelled(o) && o.order_date >= month + "-01" && o.order_date <= day);
    const orders = monthOrders.filter((o) => o.order_date === day)
      .map((o) => ({ ...o, job_type: resolveJobType(o.job_type, o.note) }));

    // ---- KPI (สูตรเดียวกับการ์ดทีมใน salePerf.jsx) ----
    const sales = orders.reduce((a, o) => a + N(o.sales), 0);
    const qty = orders.reduce((a, o) => a + N(o.qty), 0);
    const nOrders = orders.length;
    const cod = orders.filter(isCod).reduce((a, o) => a + N(o.sales), 0);
    const transfer = orders.filter((o) => o.payment_type === "โอน").reduce((a, o) => a + N(o.sales), 0);
    const other = sales - transfer - cod;
    const aov = nOrders ? sales / nOrders : 0;
    const avgUnits = nOrders ? qty / nOrders : 0;
    const dftOrders = orders.filter((o) => o.job_type === "DFT");
    const nDft = dftOrders.length, qtyDft = dftOrders.reduce((a, o) => a + N(o.qty), 0);

    // ---- คนทัก (leads) — รวมทีม + แยกรายแพลตฟอร์ม (พอร์ต funnelBreakdown ครบ 3 ฟอร์แมต) ----
    const platAgg: Record<string, { nw: number; od: number; unk: number }> = {};
    const addP = (p: string, nw: number, od: number, unk = 0) => {
      const g = platAgg[p] || (platAgg[p] = { nw: 0, od: 0, unk: 0 });
      g.nw += nw; g.od += od; g.unk += unk;
    };
    (funnelRes.data || []).forEach((f: any) => {
      const j = f.leads;
      if (j && typeof j === "object" && Object.keys(j).length) {
        for (const [p, v] of Object.entries(j)) {
          if (v && typeof v === "object") addP(p, N((v as any).new), N((v as any).old));
          else addP(p, 0, 0, N(v));
        }
      } else { addP("Facebook", N(f.leads_fb_new), N(f.leads_fb_old)); addP("LINE", N(f.leads_line_new), N(f.leads_line_old)); }
    });
    let leads = 0, newLeads = 0, oldLeads = 0;
    Object.values(platAgg).forEach((g) => { newLeads += g.nw; oldLeads += g.od; leads += g.nw + g.od + g.unk; });
    // %ปิด = ออเดอร์ "ช่องแชท" ÷ คนทัก (ตัดมาร์เก็ตเพลส/POS ที่ไม่มีคนทัก) — ตรงเว็บ salePerf/dashboard กัน %เกินจริง
    const chatOrders = orders.filter((o) => isLeadChannel(o.channel)).length;
    const closeRate = leads > 0 ? chatOrders / leads * 100 : null;

    // ---- ตารางช่องทางยุบ 5 แถว (FB/LINE/Phone/POS/Others) — คนทัก + ยอดขายบาท ----
    const CH_KEEP = ["Facebook", "LINE", "Phone", "POS"];
    const chKey = (c: string) => (CH_KEEP.includes(c) ? c : "Others");
    const chSales: Record<string, number> = {};
    orders.forEach((o) => { const k = chKey(String(o.channel || "")); chSales[k] = (chSales[k] || 0) + N(o.sales); });
    const chLeads: Record<string, { nw: number; od: number; unk: number }> = {};
    Object.entries(platAgg).forEach(([p, g]) => { const k = chKey(p); const t = chLeads[k] || (chLeads[k] = { nw: 0, od: 0, unk: 0 }); t.nw += g.nw; t.od += g.od; t.unk += g.unk; });

    // ---- CRM รายเซลล์ (CRM_SELLER เช่น FAH) — นิยาม ADR-001: ออเดอร์ช่อง LINE + โทร ----
    const crmSeller = (Deno.env.get("CRM_SELLER") || "").trim();
    let crm: any = null;
    if (crmSeller) {
      const sameSeller = (s: any) => String(s || "").trim().toLowerCase() === crmSeller.toLowerCase();
      const isCrm = (o: any) => (o.channel === "LINE" || o.channel === "Phone") && sameSeller(o.salesperson);
      const crmToday = orders.filter(isCrm);
      const dim = (() => { const [y, mo] = month.split("-").map(Number); return new Date(y, mo, 0).getDate(); })();

      // firstDate (all-time) เฉพาะลูกค้าที่เซลล์นี้ปิด CRM วันนี้ — targeted query (เบา · bounded ตามจำนวนลูกค้า)
      const codes = [...new Set(crmToday.map((o) => o.customer_code).filter((c) => c && !isMasked(c)))];
      const names = [...new Set(crmToday.filter((o) => !(o.customer_code && !isMasked(o.customer_code))).map((o) => o.customer_name).filter((n) => n && !isMasked(n)))];
      const hist: any[] = [];
      for (const [col, vals] of [["customer_code", codes], ["customer_name", names]] as const) {
        if (!vals.length) continue;
        const { data } = await sb.from("tmk_mp_orders").select("customer_code,customer_name,order_date,status").in(col, vals as string[]);
        hist.push(...(data || []));
      }
      const firstDate: Record<string, string> = {};
      hist.forEach((o) => { if (isCancelled(o)) return; const k = crmKey(o), dt = o.order_date || ""; if (k && dt && (!firstDate[k] || dt < firstDate[k])) firstDate[k] = dt; });
      const crmKeys = [...new Set(crmToday.map(crmKey).filter(Boolean))];
      const newCust = crmKeys.filter((k) => (firstDate[k] || day) >= day).length;
      const repOrders = crmToday.filter((o) => { const k = crmKey(o); return k && (firstDate[k] || day) < day; });

      const noteRow = (crmNoteRes.data || []).find((r: any) => sameSeller(r.salesperson));
      crm = {
        seller: crmSeller,
        sales: crmToday.reduce((a, o) => a + N(o.sales), 0),
        line: crmToday.filter((o) => o.channel === "LINE").reduce((a, o) => a + N(o.sales), 0),
        phone: crmToday.filter((o) => o.channel === "Phone").reduce((a, o) => a + N(o.sales), 0),
        orders: crmToday.length,
        qty: crmToday.reduce((a, o) => a + N(o.qty), 0),
        buyers: crmKeys.length,
        oldCust: crmKeys.length - newCust,
        newCust,
        repurchaseOrders: repOrders.length,
        repurchaseBaht: repOrders.reduce((a, o) => a + N(o.sales), 0),
        mtd: monthOrders.filter(isCrm).reduce((a, o) => a + N(o.sales), 0),
        target: (crmTargetRes.data || []).filter((r: any) => sameSeller(r.salesperson)).reduce((a: number, r: any) => a + N(r.sales_target), 0),
        daysLeft: dim - Number(day.slice(8, 10)),
        data: normNoteData(noteRow?.data),
      };
    }

    // ---- ข้อความ text (altText + fallback REPORT_FORMAT=text) ----
    const headTxt = slot === "night" ? "🌙 สรุปยอด 22:00 น." : slot === "evening" ? "🌆 สรุปยอด 17:00 น." : slot === "noon" ? "🕛 สรุปยอด 12:00 น." : "📊 สรุปยอดประจำวัน";
    const [yy, mm, dd] = day.split("-");
    const dateTh = `${Number(dd)}/${Number(mm)}/${Number(yy) + 543}`;
    const lines = [
      `${headTxt} · ${dateTh}`, `━━━━━━━━━━━━`,
      `💰 ยอดขายรวม  ${baht(sales)}`, `   ├ โอน  ${baht(transfer)}`, `   └ COD  ${baht(cod)}`,
    ];
    if (other > 0) lines.push(`   • อื่นๆ  ${baht(other)}`);
    lines.push(`📦 จำนวนออเดอร์  ${nOrders}`, `👕 จำนวนตัว  ${qty}`, `━━━━━━━━━━━━`);
    lines.push(`💬 รวมคนทัก  ${leads} (ใหม่ ${newLeads} · เก่า ${oldLeads})${closeRate != null ? ` · ปิด ${closeRate.toFixed(2)}%` : ""}`);
    lines.push(`🧺 Basket size  ${baht(aov)}`, `📐 AVG  ${fmtAvg(avgUnits)} ตัว/ออเดอร์`, `🧵 DFT  ${nDft} ออเดอร์ · ${qtyDft} ตัว`);
    if (crm) {
      lines.push(`━━━━━━━━━━━━`, `📞 CRM · ${crm.seller}`);
      lines.push(`   ยอด ${crm.orders > 0 ? `${baht(crm.sales)} · ${crm.orders} ออเดอร์` : "—"}`);
      if (crm.target > 0) lines.push(`   เป้า ${baht(crm.target)} · สะสม ${baht(crm.mtd)} (${Math.round(crm.mtd / crm.target * 100)}%)`);
    }
    if (nOrders === 0) lines.push(`(ยังไม่มีออเดอร์ในวันนี้)`);
    const message = lines.join("\n");

    // ---- ประกอบข้อความ LINE ----
    const useText = (Deno.env.get("REPORT_FORMAT") || "flex") === "text" || url.searchParams.get("format") === "text";
    const mArgs = { slot, day, sales, transfer, cod, nOrders, qty, leads, newLeads, oldLeads, chLeads, chSales, closeRate, aov, avgUnits, nDft, qtyDft };
    const bubbles: any[] = [buildMainBubble(mArgs)];
    if (crm) bubbles.push(buildCrmBubble({ day, crm }));
    const flexContents = bubbles.length > 1 ? { type: "carousel", contents: bubbles } : bubbles[0];
    const lineMsg = useText
      ? { type: "text", text: message.slice(0, 4900) }
      : { type: "flex", altText: message.slice(0, 400), contents: flexContents };

    if (dry) return json({ ok: true, dry: true, date: day, slot, sales, orders: nOrders, bubbles: bubbles.length, format: useText ? "text" : "flex", preview: message, flex: useText ? undefined : flexContents });

    // ---- ส่ง LINE (push เท่านั้น) ----
    if (!target) return json({ error: "ยังไม่ได้ตั้ง LINE_TARGET_ID (groupId/userId ปลายทาง)", preview: message }, 500);
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: target, messages: [lineMsg] }),
    });
    if (!r.ok) { const t = await r.text(); return json({ error: "LINE API ตอบผิดพลาด: " + t, preview: message }, 502); }
    return json({ ok: true, slot, date: day, sales, orders: nOrders, bubbles: bubbles.length, format: useText ? "text" : "flex", preview: message });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
