// ============================================================
//  TMK — daily-sale-report  (Supabase Edge Function, Deno)
// ============================================================
//  สรุปยอดขาย "รายวัน" ส่งเข้า LINE (รอบเที่ยง + รอบเย็น)
//  - เรียกโดย pg_cron ผ่าน pg_net วันละ 2 รอบ (ดู migration 20260803-daily-report-cron.sql)
//  - ไม่มี user session (cron) → ป้องกันด้วย CRON_SECRET (header x-cron-secret)
//  - อ่าน DB ด้วย service role (bypass RLS) เหมือน line-broadcast/ai-extract
//  - aggregate ให้ตรง "การ์ดทีม" ในหน้า ประสิทธิภาพเซลล์ (salePerf.jsx):
//      ยอดรวม / โอน / COD / ออเดอร์ / จำนวนตัว / AOV / คนทัก
//    รวม merge ชั้น override (tmk_order_overrides) เพราะกระทบ sales/payment/cod
//  - ส่งแบบ push ไป LINE_TARGET_ID (groupId/userId) เท่านั้น — *ไม่* broadcast
//    (กันยอดขายภายในรั่วไปถึงลูกค้าที่ฟอลโล OA)
//
//  Deploy:  supabase functions deploy daily-sale-report --no-verify-jwt
//  Secrets: LINE_CHANNEL_ACCESS_TOKEN (มีอยู่แล้วจาก line-broadcast)
//           LINE_TARGET_ID   = groupId หรือ userId ปลายทาง (ดึงด้วย line-whoami)
//           CRON_SECRET      = สตริงลับ ตั้งเอง (ให้ตรงกับใน cron migration)
//  ทดสอบเอง: curl -X POST "<url>?slot=noon&key=<CRON_SECRET>"
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
      sales: _num(ov.sales, o.sales),
      qty: _num(ov.qty, o.qty),
      cod_amount: _num(ov.cod_amount, o.cod_amount),
      order_date: _str(ov.order_date, o.order_date),
    };
  });
}

const isCancelled = (o: any) => String(o.status || "").toLowerCase() === "cancelled";
const isCod = (o: any) => o.payment_type === "COD" || (Number(o.cod_amount) || 0) > 0;

// ---- ประเภทงาน DFT (พอร์ตจาก src/lib/saleData.js — หมายเหตุเป็นเจ้าของ) ----
const DFT_RE = /\bdft\b/i;
function resolveJobType(jobType: any, note: any) {
  const jt = jobType === "ส่ง" ? "ปลีก" : (jobType || "ปลีก");
  const hasDft = DFT_RE.test(String(note || ""));
  if (jt === "ปลีก" && hasDft) return "DFT";
  if (jt === "DFT" && !hasDft) return "ปลีก";
  return jt;
}
// แสดงค่าเฉลี่ยแบบ "1" ถ้าลงตัว, "1.3" ถ้าไม่ลงตัว
const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ---- สร้างการ์ด Flex (bubble) — ภาษาดีไซน์เดียวกับเว็บ (src/index.css + salePerf.jsx) ----
// การ์ดขาว ขอบ #E4E4E7 มุม 12px · label 11px --ink-3 · ยอดรวม --accent-2 · โอน --good · COD --warn
const C = {
  ink: "#09090B",      // --ink
  ink2: "#3F3F46",     // --ink-2 (ข้อความรอง เช่น บันทึก CRM)
  ink3: "#71717A",     // --ink-3 (muted label)
  ink4: "#A1A1AA",     // --ink-4 (ค่าว่าง —)
  border: "#E4E4E7",   // --surface-3 (ขอบการ์ด)
  surface2: "#F4F4F5", // --surface-2 (รางแถบ progress)
  accent2: "#4338CA",  // --accent-2 (ยอดขายรวม)
  good: "#16A34A",     // --good (โอน / ถึงเป้า)
  warn: "#CA8A04",     // --warn (COD)
  bad: "#DC2626",      // --bad (ต่ำกว่าเป้า)
  white: "#FFFFFF",
};
function buildFlex(m: any) {
  const [yy, mm, dd] = m.day.split("-").map(Number);
  const dateTh = `${dd} ${TH_MON[mm]} ${yy + 543}`;
  // ชื่อรอบใส่เวลาตรงๆ — เลี่ยงคำวรรณยุกต์ซ้อนสระบน (เที่ยง/สิ้นวัน) ที่ LINE Flex ตัดชั้นบนหาย
  const head = m.slot === "night" ? "สรุปยอด 22:00 น." : m.slot === "evening" ? "สรุปยอด 17:00 น." : m.slot === "noon" ? "สรุปยอด 12:00 น." : "สรุปยอดประจำวัน";
  const B = (n: number) => "฿ " + Math.round(n).toLocaleString("en-US"); // เว้นวรรคหลัง ฿ — ฟอนต์ LINE เรนเดอร์ ฿ เบียดเลขจนดูเหมือนขีดทับ
  // แบรนด์ — โลโก้ (URL สาธารณะ เช่นบน Storage tmk-images) + ลิงก์เปิดเว็บ (ตั้งผ่าน secrets · ไม่ตั้ง = ซ่อน)
  const logoUrl = Deno.env.get("LOGO_URL") || "";
  const dashUrl = Deno.env.get("DASHBOARD_URL") || "";

  // การ์ดตัวเลข = rounded-xl border p-3 ของเว็บ (ขอบบางบนพื้นขาว ไม่มีพื้นสี)
  // sz: ฟอนต์ตัวเลข — คุมไม่ให้ใหญ่จนล้นการ์ด (hero=lg · ที่เหลือ=md)
  const card = (label: string, val: string, color: string, sz = "md") => ({
    type: "box", layout: "vertical", flex: 1,
    borderWidth: "1px", borderColor: C.border, cornerRadius: "12px",
    paddingAll: "12px", backgroundColor: C.white, spacing: "none",
    contents: [
      { type: "text", text: label, size: "xs", color: C.ink3 },
      { type: "text", text: val, size: sz, weight: "bold", color, margin: "sm" },
    ],
  });
  // ค่าเงินที่เป็น 0 → "—" สี ink-3 (ตามเว็บ)
  const money = (n: number, color: string) => n > 0 ? { v: B(n), c: color } : { v: "—", c: C.ink4 };
  const tf = money(m.transfer, C.good), cd = money(m.cod, C.warn);

  // แถว label→value (โซนมิติรอง ใต้เส้นคั่น)
  const kvRow = (label: string, val: string, vc = C.ink) => ({
    type: "box", layout: "horizontal", contents: [
      { type: "text", text: label, size: "sm", color: C.ink3, flex: 5 },
      { type: "text", text: val, size: "sm", weight: "bold", color: vc, align: "end", flex: 6 },
    ],
  });

  // ---- โซนคนทัก (ตาม LeadPanel ของเว็บ) — tiles รวม/ใหม่/เก่า/%ปิด + ตารางรายแพลตฟอร์ม ----
  const tile = (label: string, val: string, color = C.ink) => ({
    type: "box", layout: "vertical", flex: 1, borderWidth: "1px", borderColor: C.border,
    cornerRadius: "12px", paddingAll: "8px", contents: [
      { type: "text", text: label, size: "xxs", color: C.ink3, align: "center" },
      { type: "text", text: val, size: "sm", weight: "bold", color, align: "center", margin: "xs" },
    ],
  });
  const numCell = (n: number, flexN: number) =>
    ({ type: "text", text: n > 0 ? String(n) : "—", size: "sm", weight: "bold", color: n > 0 ? C.ink : C.ink4, align: "end", flex: flexN });
  // ตารางช่องทางยุบ 5 แถว (FB/LINE/Phone/POS/อื่นๆ) — คนทัก ใหม่/เก่า + ยอดขายบาทต่อช่องทาง
  const platHeader = {
    type: "box", layout: "horizontal", contents: [
      { type: "text", text: "ช่องทาง", size: "xxs", color: C.ink3, flex: 3 },
      { type: "text", text: "ใหม่", size: "xxs", color: C.ink3, align: "end", flex: 2 },
      { type: "text", text: "เก่า", size: "xxs", color: C.ink3, align: "end", flex: 2 },
      { type: "text", text: "ยอดขาย", size: "xxs", color: C.ink3, align: "end", flex: 3 },
    ],
  };
  const chNames = ["Facebook", "LINE", "Phone", "POS", "Others"];
  const platRows = chNames.map((p) => {
    const g = (m.chLeads || {})[p] || { nw: 0, od: 0, unk: 0 };
    const s = (m.chSales || {})[p] || 0;
    return {
      type: "box", layout: "horizontal", contents: [
        { type: "text", text: p, size: "sm", color: C.ink3, flex: 3 },
        numCell(g.nw, 2), numCell(g.od, 2),
        { type: "text", text: s > 0 ? B(s) : "—", size: "sm", weight: "bold", color: s > 0 ? C.ink : C.ink4, align: "end", flex: 3 },
      ],
    };
  });

  // ---- โซน CRM (ยอดวันนี้ + เป้าเดือน + แถบ progress + บันทึกจากเว็บ) ----
  const crm = m.crm;
  const crmRows: any[] = [];
  const crmNotes: any[] = [];
  if (crm) {
    crmRows.push(kvRow("ยอด CRM", crm.orders > 0 ? `${B(crm.sales)} · ${crm.orders} ออเดอร์` : "—", crm.orders > 0 ? C.ink : C.ink4));
    crmRows.push(kvRow("แยกช่องทาง", `LINE ${crm.line > 0 ? B(crm.line) : "—"} · โทร ${crm.phone > 0 ? B(crm.phone) : "—"}`, (crm.line + crm.phone) > 0 ? C.ink : C.ink4));
    crmRows.push(kvRow("ลูกค้า", crm.orders > 0 ? `เก่า ${crm.oldC} · ใหม่ ${crm.newC}` : "—", crm.orders > 0 ? C.ink : C.ink4));
    if (crm.target > 0) {
      const pct = crm.mtd / crm.target * 100;
      const diff = crm.mtd - crm.target;
      crmRows.push(kvRow(`เป้า ${TH_MON[mm]}`, B(crm.target)));
      crmRows.push(kvRow(`สะสม ${TH_MON[mm]}`, `${B(crm.mtd)} (${pct.toFixed(0)}%)`, pct >= 100 ? C.good : C.ink));
      crmRows.push(kvRow("ส่วนต่าง · วันเหลือ", `${diff >= 0 ? "+" : "-"}${B(Math.abs(diff))} · ${crm.daysLeft} วัน`, diff >= 0 ? C.good : C.bad));
      // แถบ progress เป้า (เขียวเมื่อถึงเป้า)
      crmRows.push({
        type: "box", layout: "vertical", backgroundColor: C.surface2, cornerRadius: "3px", height: "6px", margin: "sm",
        contents: [{
          type: "box", layout: "vertical", backgroundColor: pct >= 100 ? C.good : C.accent2, cornerRadius: "3px", height: "6px",
          width: Math.max(2, Math.min(100, Math.round(pct))) + "%", contents: [{ type: "filler" }],
        }],
      });
    }
    for (const r of (crm.notes || []).slice(0, 3)) {
      crmNotes.push({ type: "text", text: `📝 ${r.salesperson}: ${String(r.note).slice(0, 200)}`, size: "xs", color: C.ink2, wrap: true, margin: "sm" });
    }
  }

  // หัวการ์ด: โลโก้ (ซ้าย) + ชื่อรายงานตัวใหญ่ + บรรทัดรอง "TMK Operation · วันที่"
  const headerRow = {
    type: "box", layout: "horizontal", spacing: "md", contents: [
      ...(logoUrl ? [{ type: "image", url: logoUrl, size: "44px", aspectRatio: "1:1", aspectMode: "fit", flex: 0, gravity: "center" }] : []),
      { type: "box", layout: "vertical", spacing: "xs", justifyContent: "center", contents: [
        { type: "text", text: head, size: "lg", weight: "bold", color: C.ink },
        { type: "text", text: `TMK Operation · ${dateTh}`, size: "xs", color: C.ink3 },
      ] },
    ],
  };

  const bubble: any = {
    type: "bubble",
    styles: { body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "20px",
      contents: [
        headerRow,
        { type: "separator", margin: "lg", color: C.border },
        // ยอดขายรวม — การ์ดเต็มแถว ตัวเลขสี accent-2 เหมือนการ์ดทีม
        { type: "box", layout: "vertical", margin: "lg", contents: [
          card("ยอดขายรวม", B(m.sales), C.accent2, "lg"),
        ] },
        // โอน / COD
        { type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [
          card("ยอดโอน", tf.v, tf.c),
          card("ยอด COD", cd.v, cd.c),
        ] },
        // ออเดอร์ / จำนวนตัว — ตัวเลขสี ink ปกติ (ตามเว็บ)
        { type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [
          card("ออเดอร์", `${m.nOrders}`, C.ink),
          card("จำนวนตัว", `${m.qty}`, C.ink),
        ] },
        { type: "separator", margin: "lg", color: C.border },
        // ---- คนทักทั้งทีม (โชว์เสมอ แม้ยังไม่มีข้อมูล) ----
        { type: "text", text: "คนทักของทีม", size: "sm", weight: "bold", color: C.ink, margin: "lg" },
        { type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: [
          tile("ทักรวม", String(m.leads), m.leads > 0 ? C.ink : C.ink4),
          tile("ใหม่", String(m.newLeads), m.newLeads > 0 ? C.good : C.ink4),
          tile("เก่า", String(m.oldLeads), m.oldLeads > 0 ? C.ink : C.ink4),
          tile("%ปิด", m.closeRate != null ? `${m.closeRate.toFixed(1)}%` : "—", m.closeRate != null ? C.ink : C.ink4),
        ] },
        { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [platHeader, ...platRows] },
        { type: "separator", margin: "lg", color: C.border },
        // ---- มิติรอง ----
        { type: "box", layout: "vertical", spacing: "sm", margin: "lg", contents: [
          kvRow("Basket/AOV", B(m.aov)),
          kvRow("AVG ตัว/ออเดอร์", fmtAvg(m.avgUnits) + " ตัว"),
          kvRow("งาน DFT", m.nDft > 0 ? `${m.nDft} ออเดอร์ · ${m.qtyDft} ตัว` : "—", m.nDft > 0 ? C.ink : C.ink4),
        ] },
        // ---- CRM (โชว์เสมอ · เป้า/บันทึกโผล่เมื่อมีข้อมูล) ----
        ...(crmRows.length ? [
          { type: "separator", margin: "lg", color: C.border },
          { type: "text", text: crm?.seller ? `CRM · ${crm.seller} (LINE + โทร)` : "CRM (LINE + โทร)", size: "sm", weight: "bold", color: C.ink, margin: "lg" },
          { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: crmRows },
          ...crmNotes,
        ] : []),
      ],
    },
  };
  // ปุ่มเปิดเว็บ (ถ้าตั้ง DASHBOARD_URL)
  if (dashUrl) bubble.footer = {
    type: "box", layout: "vertical", paddingAll: "12px", contents: [
      { type: "button", style: "link", height: "sm", color: C.accent2,
        action: { type: "uri", label: "เปิดแดชบอร์ด TMK →", uri: dashUrl } },
    ],
  };
  return bubble;
}

Deno.serve(async (req) => {
  try {
    // ---- auth: CRON_SECRET (กัน public ยิงเผา token) ----
    const secret = Deno.env.get("CRON_SECRET");
    const got = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("key");
    if (secret && got !== secret) return json({ error: "unauthorized" }, 401);

    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return json({ error: "ยังไม่ได้ตั้ง secret LINE_CHANNEL_ACCESS_TOKEN" }, 500);
    const target = Deno.env.get("LINE_TARGET_ID"); // groupId/userId ปลายทาง

    const url = new URL(req.url);
    const slot = url.searchParams.get("slot") || "";           // noon | evening | night
    const day = url.searchParams.get("date") || bkkToday();     // override วันได้ (ทดสอบ/ย้อนหลัง)
    const dry = url.searchParams.get("dry") === "1";            // dry=1 → ไม่ส่งจริง คืน preview

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- ดึงข้อมูล: ออเดอร์ทั้งเดือนถึงวันนี้ (วันนี้=รายงาน · ทั้งเดือน=CRM สะสม) + เป้า/บันทึก CRM ----
    // หมายเหตุ: เดือนละ ~300-500 แถว ยังต่ำกว่า cap 1000 ของ PostgREST มาก — ถ้าธุรกิจโตแตะพันออเดอร์/เดือน ต้องเปลี่ยนเป็น paged fetch
    const month = day.slice(0, 7);
    const [ordersRes, ovRes, funnelRes, crmTargetRes, crmNoteRes] = await Promise.all([
      sb.from("tmk_mp_orders")
        .select("order_no,source,salesperson,payment_type,customer_type,qty,sales,cod_amount,order_date,status,channel,job_type,note")
        .gte("order_date", month + "-01").lte("order_date", day),
      sb.from("tmk_order_overrides").select("*"),
      sb.from("tmk_sales_funnel").select("*").eq("date", day),
      sb.from("tmk_crm_targets").select("salesperson,sales_target").eq("month", month), // ตารางอาจยังไม่มี → graceful
      sb.from("tmk_crm_notes").select("salesperson,note").eq("date", day),
    ]);
    if (ordersRes.error) return json({ error: "อ่านออเดอร์ไม่ได้: " + ordersRes.error.message }, 500);

    const ovMap: Record<string, any> = {};
    (ovRes.data || []).forEach((x: any) => { ovMap[x.order_id] = x; });
    const monthOrders = mergeOv(ordersRes.data || [], ovMap)
      .filter((o) => !isCancelled(o) && o.order_date >= month + "-01" && o.order_date <= day); // order_date อาจถูก override → กรองซ้ำ
    const orders = monthOrders.filter((o) => o.order_date === day)
      .map((o) => ({ ...o, job_type: resolveJobType(o.job_type, o.note) })); // DFT จากหมายเหตุ (ทั้งมี/ไม่มี override)

    // ---- KPI (สูตรเดียวกับการ์ดทีมใน salePerf.jsx) ----
    const sales = orders.reduce((a, o) => a + N(o.sales), 0);
    const qty = orders.reduce((a, o) => a + N(o.qty), 0);
    const nOrders = orders.length;
    const cod = orders.filter(isCod).reduce((a, o) => a + N(o.sales), 0);
    const transfer = orders.filter((o) => o.payment_type === "โอน").reduce((a, o) => a + N(o.sales), 0);
    const other = sales - transfer - cod; // ช่องทางอื่น (มาร์เก็ตเพลส ฯลฯ) ถ้ามี
    const aov = nOrders ? sales / nOrders : 0;               // Basket size
    const avgUnits = nOrders ? qty / nOrders : 0;            // AVG ตัว/ออเดอร์
    const dftOrders = orders.filter((o) => o.job_type === "DFT");
    const nDft = dftOrders.length;
    const qtyDft = dftOrders.reduce((a, o) => a + N(o.qty), 0);

    // ---- คนทัก (leads) — รวมทีม + แยกรายแพลตฟอร์ม (พอร์ต funnelBreakdown จาก saleData.js ครบ 3 ฟอร์แมต) ----
    const platAgg: Record<string, { nw: number; od: number; unk: number }> = {};
    const addP = (p: string, nw: number, od: number, unk = 0) => {
      const g = platAgg[p] || (platAgg[p] = { nw: 0, od: 0, unk: 0 });
      g.nw += nw; g.od += od; g.unk += unk;
    };
    (funnelRes.data || []).forEach((f: any) => {
      const j = f.leads;
      if (j && typeof j === "object" && Object.keys(j).length) {
        for (const [p, v] of Object.entries(j)) {
          if (v && typeof v === "object") addP(p, N((v as any).new), N((v as any).old)); // (ก) {new,old}
          else addP(p, 0, 0, N(v));                                                      // (ข) number แบน
        }
      } else {                                                                            // (ค) legacy 4 คอลัมน์
        addP("Facebook", N(f.leads_fb_new), N(f.leads_fb_old));
        addP("LINE", N(f.leads_line_new), N(f.leads_line_old));
      }
    });
    let leads = 0, newLeads = 0, oldLeads = 0;
    Object.values(platAgg).forEach((g) => { newLeads += g.nw; oldLeads += g.od; leads += g.nw + g.od + g.unk; });
    const closeRate = leads > 0 ? nOrders / leads * 100 : null; // number — ที่แสดงค่อย toFixed

    // ---- CRM (นิยาม ADR-001 เดียวกับหน้าภาพรวม CRM: ออเดอร์ช่อง LINE + โทร) ----
    // สโคปเฉพาะเซลล์ CRM คนเดียวผ่าน secret CRM_SELLER (เช่น "FAH") — ว่าง = ทั้งทีม
    // เทียบแบบ trim+case-insensitive กันชื่อในระบบพิมพ์เล็ก/ใหญ่ไม่ตรง
    const crmSeller = (Deno.env.get("CRM_SELLER") || "").trim();
    const sameSeller = (s: any) => String(s || "").trim().toLowerCase() === crmSeller.toLowerCase();
    const inCrmScope = (o: any) => !crmSeller || sameSeller(o.salesperson);
    const isCrm = (o: any) => (o.channel === "LINE" || o.channel === "Phone") && inCrmScope(o);
    const crmToday = orders.filter(isCrm);
    const dim = (() => { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); })();
    const crm = {
      seller: crmSeller,
      sales: crmToday.reduce((a, o) => a + N(o.sales), 0),
      orders: crmToday.length,
      line: crmToday.filter((o) => o.channel === "LINE").reduce((a, o) => a + N(o.sales), 0),
      phone: crmToday.filter((o) => o.channel === "Phone").reduce((a, o) => a + N(o.sales), 0),
      oldC: crmToday.filter((o) => o.customer_type === "ลูกค้าเก่า").length,
      newC: crmToday.filter((o) => o.customer_type === "ลูกค้าใหม่").length,
      mtd: monthOrders.filter(isCrm).reduce((a, o) => a + N(o.sales), 0),
      target: (crmTargetRes.data || []).filter((r: any) => !crmSeller || sameSeller(r.salesperson))
        .reduce((a: number, r: any) => a + N(r.sales_target), 0),
      daysLeft: dim - Number(day.slice(8, 10)),
      notes: (crmNoteRes.data || []).filter((r: any) => String(r.note || "").trim() && (!crmSeller || sameSeller(r.salesperson))),
    };

    // ---- ตารางช่องทางแบบยุบ: Facebook/LINE/Phone/POS คงไว้ · ที่เหลือ (IG/TikTok/มาร์เก็ตเพลส/Direct) → อื่นๆ ----
    const CH_KEEP = ["Facebook", "LINE", "Phone", "POS"];
    const chKey = (c: string) => (CH_KEEP.includes(c) ? c : "Others"); // "อื่นๆ" สระ+วรรณยุกต์ซ้อน → Flex ตัดชั้นบน · ใช้อังกฤษเข้าชุดชื่อช่องทาง
    // ยอดขายต่อช่องทาง (จากออเดอร์ที่ merge override แล้ว · ตัดยกเลิกแล้ว)
    const chSales: Record<string, number> = {};
    orders.forEach((o) => { const k = chKey(String(o.channel || "")); chSales[k] = (chSales[k] || 0) + N(o.sales); });
    // คนทักต่อช่องทาง (ยุบด้วย key เดียวกัน)
    const chLeads: Record<string, { nw: number; od: number; unk: number }> = {};
    Object.entries(platAgg).forEach(([p, g]) => {
      const k = chKey(p); const t = chLeads[k] || (chLeads[k] = { nw: 0, od: 0, unk: 0 });
      t.nw += g.nw; t.od += g.od; t.unk += g.unk;
    });

    // ---- ข้อความ ----
    const head = slot === "night" ? "🌙 สรุปยอด 22:00 น." : slot === "evening" ? "🌆 สรุปยอด 17:00 น." : slot === "noon" ? "🕛 สรุปยอด 12:00 น." : "📊 สรุปยอดประจำวัน";
    const [yy, mm, dd] = day.split("-");
    const dateTh = `${Number(dd)}/${Number(mm)}/${Number(yy) + 543}`;
    const lines = [
      `${head} · ${dateTh}`,
      `━━━━━━━━━━━━`,
      `💰 ยอดขายรวม  ${baht(sales)}`,
      `   ├ โอน  ${baht(transfer)}`,
      `   └ COD  ${baht(cod)}`,
    ];
    if (other > 0) lines.push(`   • อื่นๆ  ${baht(other)}`);
    lines.push(`📦 จำนวนออเดอร์  ${nOrders}`);
    lines.push(`👕 จำนวนตัว  ${qty}`);
    lines.push(`━━━━━━━━━━━━`);
    lines.push(`💬 รวมคนทัก  ${leads} (ใหม่ ${newLeads} · เก่า ${oldLeads})${closeRate != null ? ` · ปิด ${closeRate.toFixed(2)}%` : ""}`);
    lines.push(`🧺 Basket size  ${baht(aov)}`);
    lines.push(`📐 AVG  ${fmtAvg(avgUnits)} ตัว/ออเดอร์`);
    lines.push(`🧵 DFT  ${nDft} ออเดอร์ · ${qtyDft} ตัว`);
    lines.push(`━━━━━━━━━━━━`);
    lines.push(`📞 CRM วันนี้  ${crm.orders > 0 ? `${baht(crm.sales)} · ${crm.orders} ออเดอร์ (เก่า ${crm.oldC}/ใหม่ ${crm.newC})` : "—"}`);
    if (crm.target > 0) lines.push(`🎯 เป้า CRM ${baht(crm.target)} · สะสม ${baht(crm.mtd)} (${Math.round(crm.mtd / crm.target * 100)}%)`);
    if (nOrders === 0) lines.push(`(ยังไม่มีออเดอร์ในวันนี้)`);
    const message = lines.join("\n"); // ใช้เป็น altText (โผล่ใน noti) + fallback text

    // ---- การ์ด Flex (default) · ตั้ง REPORT_FORMAT=text เพื่อส่งเป็นข้อความล้วนแทน ----
    const useText = (Deno.env.get("REPORT_FORMAT") || "flex") === "text" || url.searchParams.get("format") === "text";
    const flex = buildFlex({ slot, day, sales, transfer, cod, other, nOrders, qty, leads, newLeads, oldLeads, chLeads, chSales, closeRate, aov, avgUnits, nDft, qtyDft, crm });
    const lineMsg = useText
      ? { type: "text", text: message.slice(0, 4900) }
      : { type: "flex", altText: message.slice(0, 400), contents: flex };

    if (dry) return json({ ok: true, dry: true, date: day, slot, sales, orders: nOrders, format: useText ? "text" : "flex", preview: message, flex: useText ? undefined : flex });

    // ---- ส่ง LINE (push เท่านั้น) ----
    if (!target) return json({ error: "ยังไม่ได้ตั้ง LINE_TARGET_ID (groupId/userId ปลายทาง)", preview: message }, 500);
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: target, messages: [lineMsg] }),
    });
    if (!r.ok) { const t = await r.text(); return json({ error: "LINE API ตอบผิดพลาด: " + t, preview: message }, 502); }
    return json({ ok: true, slot, date: day, sales, orders: nOrders, format: useText ? "text" : "flex", preview: message });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
