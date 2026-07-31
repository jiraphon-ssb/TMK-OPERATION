# Glossary — คำศัพท์ระบบ Sale / CRM

คำนิยามกลาง เพื่อกันความเข้าใจคลาดเคลื่อนระหว่างตัวเลขในหน้า/รายงานต่าง ๆ
(เริ่มจาก PART 87 — ขยายเพิ่มได้เรื่อย ๆ)

---

## ยอด CRM (CRM sales)
**ยอดขายจากออเดอร์ที่ปิดผ่านช่องทาง LINE + โทร (Phone)** ที่ไม่ถูกยกเลิก และคิดหลัง merge override แล้ว
- นิยามตาม [ADR-001](adr/ADR-001-crm-sales-definition.md) — **ผูกกับช่องทาง ไม่ผูกกับตัวคน**
- โค้ด: `src/lib/crmAgg.js` → `isCrmOrder(o)` (`channel ∈ {'LINE','Phone'}`), `buildCrmMonth(orders, month)`
- แสดงที่: แดชบอร์ด "ยอด CRM" ด้านบนหน้าลูกค้า (CRM) — คิดราย **เดือน** ที่เลือก

## ลูกค้า CRM (CRM customer / segment `segCrm`)
สมาชิกของ segment "CRM (โทร+LINE)" ในตารางรายชื่อลูกค้า — เป็นสมาชิกถ้า **อย่างใดอย่างหนึ่ง**:
1. เคยซื้อผ่านช่องทาง LINE หรือ Phone (`channels.has('LINE'|'Phone')`), หรือ
2. ถูกตั้ง **"ช่องทางติดต่อหลัก (CRM)"** = โทร/LINE ในโปรไฟล์ (`contact_channel`) แม้ยอดจะมาจากช่องอื่น
- โค้ด: `buildDirectory()` ใน `src/saleCrm.jsx` → `segPhone/segLine/segCrm`

> ⚠️ **จุดที่ต่างกันโดยตั้งใจ:** "ลูกค้า CRM" (segment) **กว้างกว่า** "ยอด CRM" (แดชบอร์ด)
> ยอดรวมของ segment CRM ในตาราง **อาจไม่เท่ากับ** ยอด CRM บนแดชบอร์ด เพราะ:
> - แดชบอร์ด = ผลรวม **ยอดของออเดอร์ช่อง LINE/โทร** ในเดือนที่เลือก
> - segment ตาราง = **ลูกค้า** ที่เข้าเกณฑ์ (รวมคนที่ถูก tag `contact_channel` เอง) และเป็น **all-time** ไม่จำกัดเดือน
> ตัวเลขคนละความหมาย — ตั้งใจให้เป็นเช่นนี้ (ดูหัวข้อคั่น "รายชื่อลูกค้า — ทั้งหมด ไม่จำกัดเดือน" ในหน้า)

## ลูกค้าใหม่ (CRM) — newBuyers
ลูกค้าที่ **ซื้อผ่าน LINE/โทรครั้งแรกในเดือนที่เลือก** (`firstCrmDate` อยู่ในเดือนนั้น)

## ซื้อซ้ำ (CRM) — repeatBuyers
ลูกค้าที่ซื้อผ่าน LINE/โทรในเดือนที่เลือก และ **มีประวัติซื้อ CRM มาก่อนเดือนนั้น**
- คงเสมอว่า `newBuyers + repeatBuyers = buyers` (จำนวนลูกค้าที่ซื้อ CRM ในเดือน)

## สัดส่วน CRM (crmShare)
`ยอด CRM ÷ ยอดขายรวมทุกช่องทาง` ของเดือนนั้น (%) — บอกว่าเดือนนี้ยอดมาจากงาน CRM กี่ %

## Scope ต่อเซลล์ (แดชบอร์ด)
แดชบอร์ด CRM มีพาดหัวสลับเซลล์ได้ (default = เซลล์ CRM ที่ยอดสูงสุดของเดือนนั้น เช่น "ฟ้า") หรือเลือก "รวมทุกคน"
- **เข้าหน้าใหม่ล็อคที่เซลล์หลักเสมอ** — ตัวเลือกเซลล์เป็น session-only ไม่ persist (ตั้งแต่ PART 87.2)
- เมื่อ scope ไปที่เซลล์คนหนึ่ง: `crmSales/lineSales/phoneSales/crmOrders/crmQty/buyers/byDay/ใหม่-ซื้อซ้ำ` นับเฉพาะออเดอร์ CRM ของคนนั้น
- **`totalSales` และ `crmShare` คิดจากยอดรวมทั้งบริษัทเสมอ** (สัดส่วน = ยอด CRM ของคนนั้น ÷ ยอดรวมทั้งเดือน) — จงใจ ให้ % สะท้อนน้ำหนักจริง
- `buildCrmMonth(orders, month, seller)` — param `seller` = ชื่อเซลล์ (`''` = รวมทุกคน) · `bySeller` ไม่โดน scope (เป็นตัวเลือกของ dropdown)

## เป้ายอดขาย CRM ต่อเซลล์ (CRM target)
เป้ายอด CRM รายเดือน กรอกใน **ตั้งค่า → เป้า & คอม** (คอลัมน์ "เป้า CRM") แยกรายคน
- เก็บใน **ตารางแยก `tmk_crm_targets`** (id = `<salesperson>::<YYYY-MM>`) — **ไม่ใช้ `tmk_targets`** เพราะ `salePerf` ทำ `tmap[salesperson]` จาก `fetchTargets` แถวเป้า CRM ชื่อซ้ำจะทับเป้ายอดปกติ
- โค้ด: `src/lib/crmTargets.js` (`fetchCrmTargets/saveCrmTarget`) · ความคืบหน้า: `crmTargetProgress({crmSales, month, target, todayISO})` → `{pct, daysLeft, gap, projected}` (`daysLeft = วันในเดือน − วันที่ผ่าน` ไม่นับวันนี้)
- แดชบอร์ด scope "รวมทุกคน" → เป้า = **ผลรวมเป้าทุกเซลล์** ของเดือนนั้น
- graceful: ก่อนรัน migration `fetchCrmTargets` คืน `[]` → การ์ดโชว์ empty state (admin เห็นปุ่มตั้งเป้า)

## บันทึกประจำวัน CRM (CRM daily note)
ข้อความสั้น ๆ ต่อ (เซลล์, วัน) เช่น "ลูกค้าสอบถามเสื้อสีเทา อสม. เข้ามาเยอะ" — โผล่ใน popup รายวัน (ติดรูปแคปรายงาน)
- ตาราง `tmk_crm_notes` (id = `<salesperson>::<YYYY-MM-DD>`) · โน้ตว่าง = ลบแถว
- สิทธิ์แก้: `isAdmin(user)` หรือเป็นเจ้าของ (`myNamesOf(user).includes(salesperson)`) · scope "รวมทุกคน" = ลิสต์โน้ตทุกคนของวันนั้น
- โค้ด: `src/lib/crmTargets.js` (`fetchCrmNotes/saveCrmNote`)

> migration: `supabase/migrations/20260731-crm-targets-notes.sql` (รันมือใน Supabase — สร้าง 2 ตาราง grant+disable RLS)
