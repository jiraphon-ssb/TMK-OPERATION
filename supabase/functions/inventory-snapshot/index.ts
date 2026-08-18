// ============================================================
//  TMK — inventory-snapshot  (Supabase Edge Function, Deno)
// ============================================================
//  บันทึก snapshot มูลค่า/จำนวนสต็อกรวมทั้งร้านของ "วันนี้" (1 แถว/วัน)
//  → ตาราง tmk_inventory_snapshots(id=YYYY-MM-DD, date, units, value)
//  → ใช้วาดกราฟแนวโน้มมูลค่าคลังในรายงาน
//
//  เดิมคำนวณ+เขียนฝั่ง client ทุกครั้งที่ non-viewer โหลดแอป (src/dataContext.jsx)
//  ย้ายมา server cron (P3-6c): ยิงวันละครั้ง ไม่พึ่งการเปิดแอป · ไม่เขียนซ้ำจากหลายเครื่อง
//
//  - เรียกโดย pg_cron ผ่าน pg_net (ดู migration 20260811-inventory-snapshot-cron.sql)
//  - ไม่มี user session (cron) → ป้องกันด้วย CRON_SECRET (header x-cron-secret หรือ ?key=)
//  - อ่าน/เขียน DB ด้วย service role (bypass RLS) เหมือน daily-sale-report/line-broadcast
//  - *ไม่* รับ payload จาก client — คำนวณ units/value จาก DB เองล้วน (กันปลอมค่า)
//
//  สูตร (พอร์ตตรงจาก src/components.jsx productStock + src/lib/mapToTMK.js):
//    ต่อสินค้า: มีล็อต → onHand = Σ จำนวนทุกช่อง grid ทุกล็อต ; ไม่มีล็อต → stock_on_hand
//              stockValue = Σ (จำนวนรวมล็อต × ต้นทุน/ตัว)
//    รวมร้าน:  units = Σ onHand ; value = round(Σ stockValue)
//
//  Deploy:  supabase functions deploy inventory-snapshot --no-verify-jwt
//  Secrets: CRON_SECRET  (ใช้ร่วมกับ daily-sale-report ได้)
//  ทดสอบเอง: curl -X POST "<url>?dry=1&key=<CRON_SECRET>"
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// ---- วันที่ตามเวลาไทย (UTC+7) — cron รันเป็น UTC ต้องบวกเอง ----
function bkkToday(): string {
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return t.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---- clamp จำนวน (พอร์ตจาก components.jsx _q): ตัดลบ, ปัดจำนวนเต็ม, กัน NaN/Infinity, เพดาน 1e9 ----
const _q = (v: unknown) => { const n = Math.round(Number(v) || 0); return n > 0 ? Math.min(n, 1e9) : 0; };

// ผลรวมจำนวนทุกช่องใน 1 ล็อต — รองรับ legacy lot (มี qty ไม่มี grid)
function lotTotal(lot: any): number {
  if (!lot) return 0;
  if (lot.grid && typeof lot.grid === "object") {
    let t = 0;
    for (const c in lot.grid) { const row = lot.grid[c]; for (const s in row) t += _q(row[s]); }
    return t;
  }
  return _q(lot.qty); // legacy fallback
}
// มูลค่าต้นทุนของล็อต = จำนวนรวม × ต้นทุน/ตัว
const lotValue = (lot: any) => lotTotal(lot) * (Number(lot?.cost) || 0);

Deno.serve(async (req) => {
  try {
    // ---- auth: CRON_SECRET (กัน public ยิงเผา DB) ----
    const secret = Deno.env.get("CRON_SECRET");
    const got = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("key");
    if (secret && got !== secret) return json({ error: "unauthorized" }, 401);

    const url = new URL(req.url);
    const day = url.searchParams.get("date") || bkkToday();
    const dry = url.searchParams.get("dry") === "1";

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- ดึงสินค้าที่ยังไม่ถูกลบ (เฉพาะคอลัมน์ที่ใช้คำนวณ) ----
    const { data: products, error } = await sb
      .from("tmk_products")
      .select("stock_on_hand,lots")
      .is("deleted_at", null);
    if (error) return json({ error: error.message }, 500);

    // ---- คำนวณ units/value รวมทั้งร้าน (ตรงกับ mapToTMK.js → recordInventorySnapshot เดิม) ----
    let units = 0, value = 0;
    for (const p of products || []) {
      const lots = Array.isArray((p as any).lots) ? (p as any).lots : [];
      const hasLots = lots.length > 0;
      const lotSum = lots.reduce((a: number, l: any) => a + lotTotal(l), 0);
      const onHand = hasLots ? lotSum : Number((p as any).stock_on_hand || 0);
      units += onHand;
      value += lots.reduce((a: number, l: any) => a + lotValue(l), 0);
    }
    value = Math.round(value);

    if (dry) return json({ ok: true, dry: true, date: day, products: (products || []).length, units, value });

    // ---- upsert 1 แถว/วัน (id = วันที่) ----
    const { error: upErr } = await sb
      .from("tmk_inventory_snapshots")
      .upsert({ id: day, date: day, units, value, updated_at: new Date().toISOString() });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, date: day, products: (products || []).length, units, value });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
