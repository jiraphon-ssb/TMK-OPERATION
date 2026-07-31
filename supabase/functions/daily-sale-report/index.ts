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
const baht = (n: number) => "฿" + Math.round(Number(n) || 0).toLocaleString("en-US");
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
  ink3: "#71717A",     // --ink-3 (muted label)
  ink4: "#A1A1AA",     // --ink-4 (ค่าว่าง —)
  border: "#E4E4E7",   // --surface-3 (ขอบการ์ด)
  accent2: "#4338CA",  // --accent-2 (ยอดขายรวม)
  good: "#16A34A",     // --good (โอน)
  warn: "#CA8A04",     // --warn (COD)
  white: "#FFFFFF",
};
function buildFlex(m: any) {
  const [yy, mm, dd] = m.day.split("-").map(Number);
  const dateTh = `${dd} ${TH_MON[mm]} ${yy + 543}`;
  const head = m.slot === "evening" ? "สรุปยอดเย็น" : m.slot === "noon" ? "สรุปยอดเที่ยง" : "สรุปยอดวันนี้";
  const B = (n: number) => "฿" + Math.round(n).toLocaleString("en-US");
  // แบรนด์ — โลโก้ (URL สาธารณะ เช่นบน Storage tmk-images) + ลิงก์เปิดเว็บ (ตั้งผ่าน secrets · ไม่ตั้ง = ซ่อน)
  const logoUrl = Deno.env.get("LOGO_URL") || "";
  const dashUrl = Deno.env.get("DASHBOARD_URL") || "";

  // การ์ดตัวเลข = rounded-xl border p-3 ของเว็บ (ขอบบางบนพื้นขาว ไม่มีพื้นสี)
  const card = (label: string, val: string, color: string) => ({
    type: "box", layout: "vertical", flex: 1,
    borderWidth: "1px", borderColor: C.border, cornerRadius: "12px",
    paddingAll: "12px", backgroundColor: C.white, spacing: "none",
    contents: [
      { type: "text", text: label, size: "xs", color: C.ink3 },
      { type: "text", text: val, size: "xl", weight: "bold", color, margin: "sm" },
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
      { type: "text", text: val, size: "md", weight: "bold", color, align: "center", margin: "xs" },
    ],
  });
  const numCell = (n: number, flexN: number) =>
    ({ type: "text", text: n > 0 ? String(n) : "—", size: "sm", weight: "bold", color: n > 0 ? C.ink : C.ink4, align: "end", flex: flexN });
  const plats: Record<string, any> = m.platAgg || {};
  // โชว์ 6 แพลตฟอร์มมาตรฐานของหน้าส่งยอดเสมอ + แพลตฟอร์มอื่นที่มีข้อมูลจริง
  const platNames = ["Facebook", "LINE", "Instagram", "TikTok", "Phone", "อื่นๆ"];
  Object.keys(plats).forEach((p) => { if (!platNames.includes(p) && (plats[p].nw + plats[p].od + plats[p].unk) > 0) platNames.push(p); });
  const platHeader = {
    type: "box", layout: "horizontal", contents: [
      { type: "text", text: "ช่องทาง", size: "xxs", color: C.ink3, flex: 4 },
      { type: "text", text: "ใหม่", size: "xxs", color: C.ink3, align: "end", flex: 2 },
      { type: "text", text: "เก่า", size: "xxs", color: C.ink3, align: "end", flex: 2 },
      { type: "text", text: "รวม", size: "xxs", color: C.ink3, align: "end", flex: 2 },
    ],
  };
  const platRows = platNames.map((p) => {
    const g = plats[p] || { nw: 0, od: 0, unk: 0 };
    return {
      type: "box", layout: "horizontal", contents: [
        { type: "text", text: p, size: "sm", color: C.ink3, flex: 4 },
        numCell(g.nw, 2), numCell(g.od, 2), numCell(g.nw + g.od + g.unk, 2),
      ],
    };
  });

  // แถวแบรนด์: โลโก้ (ถ้าตั้ง LOGO_URL) + ชื่อระบบ + วันที่
  const brandRow = {
    type: "box", layout: "baseline", spacing: "sm", contents: [
      ...(logoUrl ? [{ type: "icon", url: logoUrl, size: "lg" }] : []),
      { type: "text", text: "TMK Operation", size: "sm", weight: "bold", color: C.ink, flex: 0 },
      { type: "text", text: dateTh, size: "xs", color: C.ink3, align: "end" },
    ],
  };

  const bubble: any = {
    type: "bubble",
    styles: { body: { backgroundColor: C.white }, footer: { backgroundColor: C.white } },
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "20px",
      contents: [
        brandRow,
        // ชื่อรายงาน — สไตล์หัวเพจของเว็บ (ไม่มีแถบสีทึบ)
        { type: "text", text: head, size: "lg", weight: "bold", color: C.ink, margin: "sm" },
        // ยอดขายรวม — การ์ดเต็มแถว ตัวเลขสี accent-2 เหมือนการ์ดทีม
        { type: "box", layout: "vertical", margin: "md", contents: [
          card("ยอดขายรวม", B(m.sales), C.accent2),
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
        { type: "text", text: "คนทักทั้งทีม", size: "sm", weight: "bold", color: C.ink, margin: "lg" },
        { type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: [
          tile("ทักรวม", String(m.leads), m.leads > 0 ? C.ink : C.ink4),
          tile("ใหม่", String(m.newLeads), m.newLeads > 0 ? C.good : C.ink4),
          tile("เก่า", String(m.oldLeads), m.oldLeads > 0 ? C.ink : C.ink4),
          tile("%ปิด", m.closeRate != null ? `${m.closeRate}%` : "—", m.closeRate != null ? C.ink : C.ink4),
        ] },
        { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: [platHeader, ...platRows] },
        { type: "separator", margin: "lg", color: C.border },
        // ---- มิติรอง ----
        { type: "box", layout: "vertical", spacing: "sm", margin: "lg", contents: [
          kvRow("Basket/AOV", B(m.aov)),
          kvRow("เฉลี่ย/ออเดอร์", fmtAvg(m.avgUnits) + " ตัว"),
          kvRow("งาน DFT", m.nDft > 0 ? `${m.nDft} ออเดอร์ · ${m.qtyDft} ตัว` : "—", m.nDft > 0 ? C.ink : C.ink4),
        ] },
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
    const slot = url.searchParams.get("slot") || "";           // noon | evening
    const day = url.searchParams.get("date") || bkkToday();     // override วันได้ (ทดสอบ/ย้อนหลัง)
    const dry = url.searchParams.get("dry") === "1";            // dry=1 → ไม่ส่งจริง คืน preview

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- ดึงข้อมูลของวันนั้น ----
    const [ordersRes, ovRes, funnelRes] = await Promise.all([
      sb.from("tmk_mp_orders")
        .select("order_no,source,salesperson,payment_type,customer_type,qty,sales,cod_amount,order_date,status,channel,job_type,note")
        .eq("order_date", day),
      sb.from("tmk_order_overrides").select("*"),
      sb.from("tmk_sales_funnel").select("*").eq("date", day),
    ]);
    if (ordersRes.error) return json({ error: "อ่านออเดอร์ไม่ได้: " + ordersRes.error.message }, 500);

    const ovMap: Record<string, any> = {};
    (ovRes.data || []).forEach((x: any) => { ovMap[x.order_id] = x; });
    const orders = mergeOv(ordersRes.data || [], ovMap)
      .filter((o) => !isCancelled(o) && o.order_date === day) // order_date อาจถูก override → กรองซ้ำ
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
    const closeRate = leads > 0 ? (nOrders / leads * 100).toFixed(2) : null; // เช่น "9.09"

    // ---- ข้อความ ----
    const head = slot === "evening" ? "🌆 สรุปยอดเย็น" : slot === "noon" ? "🕛 สรุปยอดเที่ยง" : "📊 สรุปยอดขายวันนี้";
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
    lines.push(`💬 รวมคนทัก  ${leads} (ใหม่ ${newLeads} · เก่า ${oldLeads})${closeRate != null ? ` · ปิด ${closeRate}%` : ""}`);
    lines.push(`🧺 Basket size  ${baht(aov)}`);
    lines.push(`📐 AVG  ${fmtAvg(avgUnits)} ตัว/ออเดอร์`);
    lines.push(`🧵 DFT  ${nDft} ออเดอร์ · ${qtyDft} ตัว`);
    if (nOrders === 0) lines.push(`(ยังไม่มีออเดอร์ในวันนี้)`);
    const message = lines.join("\n"); // ใช้เป็น altText (โผล่ใน noti) + fallback text

    // ---- การ์ด Flex (default) · ตั้ง REPORT_FORMAT=text เพื่อส่งเป็นข้อความล้วนแทน ----
    const useText = (Deno.env.get("REPORT_FORMAT") || "flex") === "text" || url.searchParams.get("format") === "text";
    const flex = buildFlex({ slot, day, sales, transfer, cod, other, nOrders, qty, leads, newLeads, oldLeads, platAgg, closeRate, aov, avgUnits, nDft, qtyDft });
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
