# ระบบขายครบวงจร Juntakarn — Blueprint (ฉบับสมบูรณ์)

> เอกสารนี้คือพิมพ์เขียวสมบูรณ์สำหรับสร้าง "ระบบขายครบวงจร" ของแบรนด์ Juntakarn (เสื้อโปโลลายไทย: สิริกานต์/จันทกานต์/กนก ฯลฯ) ที่ขายปลีก 7 ช่องทาง + งานเหมา/OEM ราชการ ทั้งหมดอยู่ใน **หน้า catalog เท่านั้น** บนฐาน React 19 + Supabase แบบ **file-import** ใช้บนมือถือเป็นหลัก รองรับ dark/light และออกแบบให้ใช้ได้ยาวหลายปีโดยไม่ต้องรื้อ

---

## 1. วิสัยทัศน์ & หลักการ

### 1.1 เป้าหมาย
เปลี่ยน "หน้ารายงาน" (กระจกสะท้อนอดีต) ให้เป็น **"เครื่องมือบริหารร้าน"** (บอกว่าวันนี้ต้องทำอะไร) สำหรับเจ้าของร้านที่ไม่ใช่สายเทค ใช้มือถือเป็นหลัก — ตอบ 3 คำถามหลักให้ได้ใน 10 วินาที:
1. **เดือนนี้ดีกว่าหรือแย่กว่าเดิม?** (เทียบงวด MoM/YoY)
2. **เงินจริงเข้ากระเป๋าเท่าไหร่?** (กำไรสุทธิหลังค่าธรรมเนียม/คืน/ต้นทุน)
3. **วันนี้ต้องทำอะไร?** (สั่งผลิตลายไหน · ตามหนี้ใคร · ลูกค้ากลุ่มไหนกำลังจะหาย)

### 1.2 หลักการออกแบบหลัก (ห้ามฝ่าฝืน)
| หลักการ | ความหมายเชิงปฏิบัติ |
|---|---|
| **Catalog-only** | ทุกฟีเจอร์อยู่ในหน้า catalog (`CatalogView`) เท่านั้น — ห้ามแตะ Dashboard / daily-sales / Planner / Settings |
| **File-import (ไม่ใช่ live API)** | ข้อมูลมาจากไฟล์ที่ผู้ใช้ export จาก Shipnity/Shopee/TikTok แล้วอัปโหลด — ทุกการนำเข้าต้อง **idempotent** (อัปซ้ำเดือนเดิม = แทนที่ ไม่บวกซ้ำ) |
| **Mobile-first** | เจ้าของร้านอยู่บนมือถือ — การ์ด 2 คอลัมน์, แถวกดได้ ≥48px, ตารางมี sticky คอลัมน์แรก, ฟิลเตอร์ ≤6 แตะ |
| **Thai-first, plain language** | ภาษาไทยทั้งหมด เลขมี thousand-separator (`N()`/`B()`), หลีกเลี่ยงศัพท์เทคนิคที่ไม่จำเป็น |
| **Future-proof** | ฟิลด์ที่ยังไม่แน่ใจ → ลง JSONB; logic แยกเป็น pure function; threshold อยู่ใน config; ห้าม magic number ฝังในโค้ด |
| **Single source of truth** | numbers ทั้งหมดมาจาก pipeline เดียว (`src/lib/mpReport.js`) — หน้าจอ, export, Google Sheet mirror อ่านชุดเดียวกัน |
| **Sheet read-only** | Supabase → Google Sheet เป็น mirror ทางเดียว (web คือทางป้อนข้อมูลเดียว) — ห้ามสร้าง Sheet → Supabase |

### 1.3 สิ่งที่สร้างเสร็จแล้ว (backbone)
- **Pipeline `mpReport.js`** — รวม Shipnity (spine ระดับออเดอร์) + Shopee (ระดับ SKU) + TikTok (ออเดอร์ใหม่) + catalog → dedup/SKU-match → คืน object 2 ระดับ
- **2 ตาราง Supabase**: `tmk_mp_orders` (ระดับออเดอร์, PK=`source:order_no`) + `tmk_mp_skus` (ระดับ SKU, PK=`source:order_no:line_index`)
- **CRM fields**: `customer_code/name/social`, `cust_total_orders/spent`
- **MpReportView** — KPI (ออเดอร์/ยอดขาย/ชิ้น/กำไร/AOV), ช่องทาง, ลาย Top15, สี/ไซซ์, เซลล์, จังหวัด, การชำระ, ใหม่/เก่า, แนวโน้มรายเดือน, ฟิลเตอร์เดือน, แท็บ CRM (top spenders/loyal/repeat)
- **SalesReportView** (รายงานภายใน กรอกมือ) — มี sell-through, velocity, daysLeft, aging, dead-stock, ABC, suggestPO, downloadCSV (มี formula-injection guard)
- **StockView/ProductsView** — on-hand, lots, reorder, suggestPO/orderPO
- **CSV import wizard** (catalog), **PWA installable**, **audit log** (`src/lib/audit.js logAudit()`)

---

## 2. สถาปัตยกรรมข้อมูล

### 2.1 ตารางที่มีอยู่แล้ว (คงโครง, ขยายแบบ idempotent)

**`tmk_mp_orders`** (1 แถว = 1 ออเดอร์) — ฟิลด์เดิม:
`id (PK=source:order_no)`, `order_no`, `source`, `channel`, `marketplace_id`, `order_month (YYYY-MM)`, `salesperson`, `province`, `payment_type`, `customer_type`, `cust_total_orders`, `qty_band`, `qty`, `sales`, `cost`, `mkt_commission`, `mkt_net_income`, `profit`, `cod_amount`, `job_type (สงวนไว้ ยังไม่ใช้)`, `import_batch`, `updated_at` + CRM: `customer_code/name/social`, `cust_total_spent`

**`tmk_mp_skus`** (1 แถว = 1 รายการในออเดอร์):
`id (PK=source:order_no:line_index)`, `order_no`, `source`, `channel`, `product_code`, `design (ลาย)`, `color`, `size`, `qty`, `line_sales`, `raw_sku_or_name`, `match_how`, `order_month`, `import_batch`, `updated_at`

### 2.2 คอลัมน์ที่ต้องเพิ่ม (migration เตรียมไว้ตั้งแต่ตอนนี้)

> ทุก migration เป็น `add column if not exists` / `create table if not exists` + `grant anon,authenticated` + `disable row level security` (ตามโมเดล UI-gate ทั้งระบบ)

| # | migration | สิ่งที่เพิ่ม | เหตุผล (ปลดล็อกฟีเจอร์) |
|---|---|---|---|
| **M1** | `attrs jsonb default '{}'` บน `tmk_mp_orders` + `tmk_mp_skus` | escape-hatch สำหรับฟิลด์ที่ยังไม่ควรเป็น typed column (gov agency อปท/สพฐ/กระทรวง, PO number, promo code, refund flag, bundle id, fabric lot) | **P0 ฐานสำคัญสุด** — กัน "death by a thousand migrations". Promote เป็น typed column + GIN index เฉพาะเมื่อ field hot |
| **M2** | `order_date date` บน orders + `order_date` บน skus (backfill ตอน re-import; mpReport.js parse อยู่แล้วแต่ทิ้ง — เก็บไว้) | **Day-grain** — ปลดล็อก cohort timing, run-rate forecast, pacing, anomaly, day/week chart, repurchase cycle. ทำตอนนี้ = ฟีเจอร์เหล่านี้เป็น pure-frontend เพิ่มภายหลัง zero-migration |
| **M3** | `status text default 'active'` + `return_amount numeric` + `refund_reason text` บน orders | **เก็บออเดอร์ยกเลิก/คืน แทนที่จะ `continue` ทิ้ง** ใน mpReport.js → ปลดล็อก return rate, net sales, reconciliation. (เป็น one-way door — ทิ้งแล้วกู้ไม่ได้) |
| **M4** | `settlement_status text` + `settled_amount numeric` บน orders | reconciliation เงินโอนเข้าจริง |
| **M5** | ใช้ `job_type` ที่มีอยู่ (เติมค่าจริง) | ปลีก/ส่ง/OEM lens |

### 2.3 ตารางใหม่ที่ต้องสร้าง

| ตาราง | คีย์ | ใช้ทำ | เฟส |
|---|---|---|---|
| `tmk_mp_import_batches` | `id` (append-only) | ledger การนำเข้า: source, filename, row_count, sales_total, qty_total, channels, month_span, created_at, created_by, status (active/superseded) → undo/rollback + audit "ตัวเลขนี้มาจากไฟล์ไหน" | P0/P1 |
| `tmk_mp_monthly` (materialized view/rollup) | month × channel × design | server-side aggregate → ไม่ต้องโหลด 50k+120k แถวลงมือถือทุกครั้ง | P1 |
| `tmk_mp_returns` | order/sku | RMA: reason code (ไซซ์ไม่พอดี/สีไม่ตรง/ชำรุด/ส่งผิด/เปลี่ยนใจ), type (refund/exchange/credit/returnless), restock flag | P2 |
| `tmk_mp_settlements` | `order_no` | payout/settlement จาก marketplace export | P2 |
| `tmk_targets` | `(scope_type, scope_id, year, month)` | เป้าเซลล์/ช่อง/ลาย/job_type → bullet bar + pacing. scope_type generic → ขยายมิติได้ฟรี | P2 |
| `tmk_mp_views` | `id` | saved views: name, definition jsonb (`{range, lens, compare, tab, sort, v}`), owner, is_shared | P2 |
| `tmk_oem_jobs` + `tmk_oem_lines` | `id` / job_id | งาน OEM/ราชการ: customer(หน่วยงาน), quoted_price, MOQ, ลาย×สี×ไซซ์ breakdown, PO_no, stage, due_date, invoice, payment_status, credit_term, VAT, WHT | P2/P3 |
| `tmk_mp_alerts` | `id` | anomaly/decision flags ที่ fire แล้ว (dismissible, persist) | P3 |

### 2.4 หลัก idempotency (สำคัญสุด)
- **orders**: upsert by PK `source:order_no` → อัปเดือนเดิมซ้ำ = ทับ ไม่บวก
- **skus**: PK `source:order_no:line_index` + แอปลบ sku ของ order_no ก่อน insert ใหม่ (กันบรรทัดเก่าค้างเมื่อจำนวนบรรทัดเปลี่ยน)
- **import_batches**: append-only — re-import = mark batch เก่า `superseded` (ไม่ลบประวัติ) แต่ projection (orders) ยังคงเป็น single-truth ผ่าน upsert
- ทุก derived metric (RFM, CLV, segment, sell-through, ROP) **คำนวณสดทุก import** ไม่ freeze → re-import ไม่ double-count

---

## 3. โครงหน้าจอ & การนำทาง (IA)

ทั้งหมดอยู่ใต้ `CatalogView({sub})` ปัจจุบันมี sub: `products | stock | report | orders | customers | campaigns | po`. ระบบขายโฟกัสที่ `report` (= `ReportHub` → `MpReportView` + `SalesReportView`)

### 3.1 โครง navigation ที่เสนอ (ขยายจาก ReportHub)

```
หน้า Catalog
└─ รายงาน (report) ─ ReportHub
   ├─ [Top control bar — คงที่ทุกแท็บ]
   │   ├─ Lens (job_type): ทั้งหมด | ปลีก | ส่ง | OEM-ราชการ      ← segbar หลัก
   │   ├─ Range picker: วันนี้/7วัน/เดือนนี้/เดือนก่อน/ไตรมาส/ปี/กำหนดเอง
   │   ├─ เทียบงวด: เดือนก่อน | ปีก่อน | ปิด
   │   └─ ⭐ Saved views (chips)  ·  ส่งออก  ·  นำเข้าไฟล์ขาย
   │
   ├─ 📌 Action Center / Daily snapshot   (บนสุด, มือถือเห็นก่อน)
   │   └─ insight cards: สั่งผลิตด่วน · ลูกหนี้เกิน · ยอดผิดปกติ · OEM ถึงกำหนด
   │
   └─ Sub-tabs (segbar):
       ├─ ภาพรวม      → 2-20-200: KPI row → trend/channel → ลาย/สี/ไซซ์ diagnostics
       ├─ ลาย & สต็อก  → sell-through, size curve, colorway matrix, reorder/ผลิตซ้ำ
       ├─ ลูกค้า (CRM) → RFM grid, segments, LTV, cohort, win-back, customer 360
       ├─ เซลล์ & เป้า → bullet bar pacing, leaderboard
       ├─ กำไร & เงิน  → margin waterfall, channel net, settlement reconciliation
       ├─ OEM/ราชการ  → pipeline kanban, AR/ลูกหนี้, tiered pricing  (โผล่เมื่อ lens=OEM)
       └─ ประวัตินำเข้า → import ledger + undo
```

### 3.2 หลัก layout (2-20-200)
1. **Status row (2 วินาที)**: KPI 5–7 ใบบนสุด (ยอดสุทธิ, กำไร, มาร์จิ้น%, ออเดอร์, AOV, ชิ้น) + delta pill เทียบงวด
2. **Trend/variance (20 วินาที)**: line รายเดือน (+ overlay งวดเทียบ) + channel breakdown
3. **Diagnostics (200 วินาที)**: ลาย/สี/ไซซ์, เซลล์, จังหวัด, ABC, aging — ใน `<details>` ยุบได้บนมือถือ

zones เป็น config array `[{section, type, defaultOpen}]` → โมดูลใหม่เสียบเข้า zone ถูกโดยไม่ต้อง re-layout, KPI cap 7 ใบบังคับด้วย config

### 3.3 มือถือ
- KPI strip เลื่อนแนวนอน / grid 2-up; lens เป็น chip แรกสุด ทุกอย่างข้างล่าง react
- ตาราง → การ์ดต่อแถว, sticky คอลัมน์แรก, แตะแถว = drill-down full-screen sheet
- drill-down state เก็บใน URL hash (`#mp?ch=shopee&design=สิริกานต์`) → back-button/แชร์ได้

---

## 4. โมดูล (เรียงตามความสำคัญ)

> รูปแบบ: **ชื่อ · ทำอะไร · ทำไม · UI/UX · ข้อมูล · effort · เผื่ออนาคต** — merge รายการซ้ำจาก 112 ฟีเจอร์แล้ว

---

### 🔴 P0 — ฐานความเชื่อถือ & การตัดสินใจ (สร้างก่อน)

#### M0.1 JSONB attrs + Day-grain date + Status-keep (data foundation)
- **ทำอะไร**: 3 migration ฐาน (M1/M2/M3 ข้อ 2.2) — เพิ่ม `attrs jsonb`, เก็บ `order_date` ระดับวัน, และ **เลิก `continue` ทิ้งออเดอร์ยกเลิก** ใน mpReport.js (เก็บเข้าพร้อม `status`)
- **ทำไม**: เป็น one-way door ทั้ง 3 — ทำตอนนี้ปลดล็อกฟีเจอร์ขั้นสูงเกือบทั้งหมด (cohort, forecast, pacing, anomaly, returns, reconciliation) แบบ zero-migration ภายหลัง; ข้ามตอนนี้ = ถูกบังคับ re-import 3 ปี + แก้ schema ทีหลัง
- **UI/UX**: มองไม่เห็น (foundation) — ยกเว้น day/week/month grain toggle ที่ trend chart
- **ข้อมูล**: แก้ mpReport.js (เก็บ date, ไม่ทิ้ง cancelled), 3 migration
- **effort**: S (migration) + M (แก้ pipeline)
- **เผื่ออนาคต**: typed spine + JSONB tail = Postgres consensus; ทุก field ใหม่ลง attrs ก่อน promote

#### M0.2 ภาพรวม/KPI + เทียบงวด (PoP: MoM/YoY) + Net Sales waterfall
- **ทำอะไร**: ทุก KPI (ยอดขาย, ออเดอร์, ชิ้น, กำไร, AOV, มาร์จิ้น%) แสดงค่าปัจจุบัน + delta pill เทียบงวด (▲12% เทียบเดือนก่อน / ปีก่อน). แทน "ยอดขายรวม" เดิมด้วย **waterfall**: GMV → −ส่วนลด → −คืน → −ค่าธรรมเนียม → รายรับสุทธิ → −COGS → กำไรขั้นต้น
- **ทำไม**: คำถามหลักคือ "ดีขึ้นไหม" + "เงินหายไปไหนระหว่างทาง". ลายไทยมี seasonality (สงกรานต์/ปีใหม่/งบราชการ ก.ย.) → YoY สำคัญ. ปัจจุบันเห็นแค่ตัวเลขนิ่ง
- **UI/UX**: segbar "เทียบ: เดือนก่อน|ปีก่อน|ปิด" เหนือ KPI row; delta pill สีเขียว/แดง (absolute + %) บรรทัด 2 บนมือถือ. waterfall = stacked bar แนวนอน (custom bar CSS เดิม), มือถือเรียงเป็นรายการ +/−. **Same-day-count guard**: เดือนปัจจุบัน (ยังไม่จบ) เทียบ MTD-to-same-day-of-prior กัน fake −60%
- **ข้อมูล**: re-aggregate `tmk_mp_orders` ตาม order_month เทียบ; fee จาก `mkt_commission`/`mkt_net_income`; ต้องการ day-grain (M0.1)
- **effort**: M
- **เผื่ออนาคต**: helper generic `compareAgg(currentFilter, compareFilter)` → ทุก chart (channel/ลาย/เซลล์) render delta column ได้; cost layer เป็น ordered array `[{label,amount,key}]` เสียบ ค่าส่ง/แพ็ก/โฆษณา ภายหลัง; เก็บเงินเป็น satang (integer) กัน rounding

#### M0.3 ลาย+สี+ไซซ์: Size curve, Sell-through, Colorway matrix
- **ทำอะไร**: (a) **Sell-through% ต่อลาย** = sold/(sold+onHand) + verdict badge (ผลิตเพิ่ม/ปกติ/ขายช้า), (b) **Size curve** ต่อลาย×สี — % mix แต่ละไซซ์ + ตรวจ "broken run" (ไซซ์ขาดทั้งที่ข้างเคียงยังขาย) + drift เทียบเดือนก่อน, (c) **Colorway matrix** ลาย×สี heatmap (units/line_sales)
- **ทำไม**: เสื้อผ้าอยู่/ตายที่ sell-through ต่อไซซ์/สี — เสี่ยงสิริกานต์ 2XL หมดขณะ 4XL จม. นี่คือ margin lever ใหญ่สุดในอุตสาหกรรมเสื้อผ้า. ปัจจุบัน Top15 จัดอันดับด้วย qty อย่างเดียว
- **UI/UX**: อัปเกรด "ลายขายดี Top15" เพิ่มคอลัมน์ sell-through% (bar) + เหลือ + verdict; การ์ด "ไซซ์ต่อลาย" mini-bar (ไซซ์ขาด = hollow/red); matrix heatmap (CSS bg-alpha, ไม่ต้อง chart lib), แตะ cell → size breakdown. มือถือ: matrix → per-ลาย color bar; sticky คอลัมน์สี
- **ข้อมูล**: `tmk_mp_skus` (design/color/size/qty) + on-hand จาก catalog (`productDesign()` join). มี `SIZE_ORDER` + sell-through styling อยู่แล้ว
- **effort**: M
- **เผื่ออนาคต**: ideal curve เก็บใน `tmk_mp_size_curve` (design, color, month, curve_json, broken_flags) → สะสมข้ามฤดู, feed production planner; threshold เป็น config; matcher (ลาย/สี/ไซซ์→SKU) ตัวเดียวใช้ทั้ง report + stock

#### M0.4 เชื่อมสต็อก ↔ ความเร็วขาย + ทำเนียบ "ควรผลิตซ้ำลายไหน"
- **ทำอะไร**: join `tmk_mp_skus` (velocity) กับ catalog on-hand → **days-of-cover, ROP** (=avgDailySales×leadTime + safetyStock), **suggested production qty** (ปัดขึ้น MOQ). Board จัด 4 บัคเก็ต: **รีบผลิต** (sell-through>70% + cover ต่ำ), **ผลิตตามรอบ**, **ระวัง** (<50%), **เลิกผลิต** (sold=0). แต่ละการ์ดมี action + qty
- **ทำไม**: เหตุผลที่รายงานขายอยู่ในหน้า catalog — make-to-stock ต้องตัดสินใจ "ผลิตลายไหน กี่ตัว เมื่อไหร่" ก่อน demand มา. reactive stockout = สายไปแล้วช่วงเทศกาล
- **UI/UX**: คอลัมน์ "จุดสั่งผลิต" + pill เขียว/เหลือง/แดง ในตาราง aging; gauge buffer = cover − lead time (red ถ้า<0). มือถือ: ranked list "ต้องสั่งวันนี้" + ปุ่ม "สร้าง PO" (reuse `orderPO()`). Expandable row → size×color heatmap สี cover
- **ข้อมูล**: bridge design↔product_code (มี `match_how` ใน pipeline) → formalize เป็น mapping table; velocity/daysLeft/aging/suggestPO มีใน SalesReportView แล้ว แต่ยังไม่ join on-hand จริง
- **effort**: L
- **เผื่ออนาคต**: leadTime/safetyStock/MOQ/maxStock เป็นคอลัมน์ต่อ design (แก้ได้) ไม่ฮาร์ดโค้ด; ROP เป็น pure helper → feed auto-PO; ทำงานทั้ง design + SKU grain (two-tier model)

#### M0.5 Net margin by channel (กำไรจริงต่อช่องหลังค่าธรรมเนียม)
- **ทำอะไร**: ใช้ fee fields ที่มี (`mkt_commission`/`mkt_net_income`) คำนวณต่อช่อง: gross → fees → net → profit + effective take-rate%. เพิ่มข้าง channel table เดิม
- **ทำไม**: Shopee/Lazada/TikTok หักต่างกันมาก (SEA effective take-rate 20–25%) ขณะ POS/phone/OEM ไม่มี fee — ranking ด้วย gross ซ่อนว่าช่องที่ "ใหญ่สุด" อาจกำไรน้อยสุด
- **UI/UX**: ขยายตาราง "ยอดขายแยกช่องทาง" เพิ่ม ค่าธรรมเนียม/ยอดสุทธิ/กำไร/%take + profit bar สองโทน; toggle "กำไรจริง vs ยอดขาย" re-sort; margin% cell เขียว/เหลือง/แดง
- **ข้อมูล**: fee columns เดิม
- **effort**: S
- **เผื่ออนาคต**: รวม fee/net calc ที่เดียวใน mpReport → ปรับเรตปีหน้าแก้จุดเดียว; manual fee-override% ต่อช่องใน settings เผื่อ export ไม่มี fee

#### M0.6 Import-batch ledger + preview-diff + one-click rollback
- **ทำอะไร**: ตาราง `tmk_mp_import_batches` (who/when/file/row counts/channels/month span/totals) + UI "ประวัตินำเข้า" timeline + ปุ่ม "ย้อนกลับชุดนี้" (ลบเฉพาะแถวของ batch) + เตือนไฟล์ซ้ำ + reconciliation diff (ยอดในไฟล์ vs จะบันทึก) ก่อนกด นำเข้า
- **ทำไม**: workflow คือ export-แล้ว-upload — ผิดง่าย (ผิดเดือน/ครึ่งเดือน/คอลัมน์เพี้ยน/ซ้ำ). เจ้าของร้านต้อง undo ได้เองโดยไม่เข้า Supabase. รักษาความเชื่อถือทั้งระบบ
- **UI/UX**: timeline batch (วันที่/ไฟล์/+เพิ่ม~อัปเดต/undo) + modal ยืนยันบอกจะลบกี่แถว; stat strip ตอน preview: ✅พร้อม/⚠️ข้อสังเกต/⛔ข้าม
- **ข้อมูล**: `import_batch` column มีอยู่แล้วบน 2 ตาราง
- **effort**: M
- **เผื่ออนาคต**: append-only ledger + replayable projection = event-sourcing-lite → importer ใหม่ (settlement/returns/OEM) ได้ undo ฟรี; ถ้า aggregation logic เปลี่ยน → re-run mpReport over retained batches แทนขอ owner export ใหม่

#### M0.7 Pre-commit validation gate (import quality)
- **ทำอะไร**: ยกระดับ preview step เป็น validation gate: จัดแถวเป็น ok/warning/blocked + count + detail (unmatched SKU, sales=0/ติดลบ, date parse fail, channel ไม่รู้จัก, order_no ซ้ำในไฟล์). เฉพาะ ok+warning import; blocked ลิสต์เหตุผล
- **ทำไม**: garbage-in คือความเสี่ยงยาวสุดของระบบที่เจ้าของเชื่อตามตรง; รูปแบบ marketplace export drift (คอลัมน์/วันที่เปลี่ยน). จับ SKU-match drop 40% หรือ column-shift **ก่อน** pollute master
- **UI/UX**: stat strip ✅N/⚠️M/⛔K แต่ละอันขยายดู sample + เหตุผลต่อแถว + reconciliation 1 บรรทัด
- **effort**: M
- **เผื่ออนาคต**: validate-then-clean, batched dedup (1 query ไม่ใช่พัน), per-chunk feedback

---

### 🟠 P1 — มูลค่าบริหารระดับสูง

#### M1.1 CRM/RFM + LTV + win-back worklist + Customer 360
- **ทำอะไร**: ต่อยอดแท็บ CRM — คำนวณ R/F/M (quintile 1–5) ต่อ `customer_code` → 11 segment ไทย (แชมป์/ภักดี/มีแววภักดี/ใหม่/กำลังจะหาย/หลับไปแล้ว/Lost/...) + **CLV** (lifetime spend × blended margin จาก cost/profit จริง) + **win-back list** (high past spend, no recent order, sort by value × days-since) + **customer 360** (segment/tier/CLV/ลายโปรด/ไซซ์/ช่อง/ประวัติ)
- **ทำไม**: ข้อมูล lifetime มีอยู่แล้ว (`cust_total_orders/spent`) แต่โชว์แค่ top spender. RFM บอก "ใครกำลังสลิป" = ROI สูงสุด; ลายไทยมีแฟนประจำ ซื้อซ้ำเยอะ; win-back ผ่าน LINE/phone ที่เจ้าของทักเองได้
- **UI/UX**: segment table/cards (ชื่อ+emoji, count, %, share bar) แตะ→filter ลูกค้า + "สิ่งที่ควรทำ" 1 บรรทัด; **5×5 RFM grid heatmap** (Recency×Frequency); KPI CLV เฉลี่ย + CLV หักทุน; win-back card + ปุ่มคัดลอกช่องทางติดต่อ (reuse copyTrack) + template ข้อความไทย; customer 360 reuse `window.__openModal('customer')`
- **ข้อมูล**: `agg.cust` มีอยู่แล้ว — ต้องเพิ่ม **last_order_date / per-order dates** (จาก M0.1 day-grain); recency relative to latest order_date ในชุด (ไม่ใช่ wall clock)
- **effort**: M
- **เผื่ออนาคต**: threshold/ชื่อ segment ใน config; เก็บ score+segment ต่อ customer object → export + Sheet mirror reuse ได้; เป็นฐาน predicted-LTV/cohort

#### M1.2 Cohort retention heatmap + repeat-rate/churn KPIs + repurchase cycle
- **ทำอะไร**: group customer ตามเดือน first-order → % กลับมาซื้อในเดือน 0,1,2,3... (triangular heatmap) + headline "อัตราซื้อซ้ำ 30/60/90 วัน" + repeat purchase rate + new-vs-returning revenue + per-customer avg days-between-orders → flag overdue/ใกล้ครบรอบ
- **ทำไม**: snapshot RFM บอกตอนนี้ แต่ cohort บอก "เก่งขึ้นไหมในการรักษาลูกค้าใหม่"; ลายไทย/ยูนิฟอร์มราชการเป็น repeat/seasonal — รู้รอบสั่งซ้ำของหน่วยงานราชการ → ทักก่อน competitor
- **UI/UX**: triangular grid single-hue (light→dark), % ใน cell, sticky คอลัมน์เดือน (มี pattern แล้ว); benchmark hint "ปกติเดือนแรก ~25-32%"; มือถือ 6 cohort ล่าสุด scroll + headline 3 ตัว; "ครบรอบสั่งซ้ำ" column ใน win-back
- **ข้อมูล**: order_month + first-seen (ต้อง day-grain M0.1)
- **effort**: M (heatmap) / L (full)
- **เผื่ออนาคต**: `cohortBy(field)` generic → first-channel/first-ลาย cohort = 1 บรรทัด; ad-spend มาทีหลัง → true LTV ต่อยอด spine เดิม

#### M1.3 Job-type lens: ปลีก / ส่ง / OEM-ราชการ
- **ทำอะไร**: เติม `job_type` (มีคอลัมน์แล้ว) จาก rule `deriveJobType(order)` (qty_band + channel + customer signal: large qty + Phone/Direct + gov agency in attrs → OEM). segbar บนสุด "ทั้งหมด|ปลีก|ส่ง|OEM-ราชการ" filter ทุก card. OEM view สลับ card (ซ่อน ไซซ์/สี Pareto, โชว์ order-size/agency)
- **ทำไม**: 2 ธุรกิจในโรงงานเดียว — ออเดอร์ 2,000 ตัว สพฐ vs 1 ตัว Shopee ทำให้ AOV/channel share/ลาย ranking เพี้ยน. แยกเพื่อวิเคราะห์แต่ละขาสะอาด
- **UI/UX**: segbar accent color ต่อ lens (ไม่สับสนโหมด); persisted ใน saved view; settings popover ปรับ qty threshold + tags
- **ข้อมูล**: `job_type` + rule function (auditable, idempotent) + attrs (agency/PO)
- **effort**: M
- **เผื่ออนาคต**: job_type เป็น filter dimension มาตรฐานใน filter-stack เดียว → compose กับ drill/saved-view/targets ฟรี; เพิ่ม job_type ที่ 4 = free

#### M1.4 เซลล์ + เป้า & pacing (Targets)
- **ทำอะไร**: ตาราง `tmk_targets` keyed `(scope_type, scope_id, year, month)` — ตั้งเป้ารายเดือน (overall/ช่อง/เซลล์/ลาย) → attainment% + **pacing** (run-rate = MTD÷days-elapsed×days-in-month vs pro-rated target) + bullet bar + leaderboard
- **ทำไม**: ยอดไม่มีเป้า = trivia. pacing บอกกลางเดือนว่าจะพลาดทันแก้ (push ช่อง/โปร); leaderboard กระตุ้นทีม
- **UI/UX**: bullet bar (actual fill + target tick + pace marker) ใช้ bar CSS เดิม; leaderboard เซลล์|เป้า|ทำได้|%บรรลุ|คาดสิ้นเดือน; เขียว≥100/เหลือง70-100/แดง<70; modal ตั้งเป้า. มือถือ 1 bullet/แถว full width
- **ข้อมูล**: `bySales`/`channelRank` มีอยู่; ต้อง day-grain (pacing)
- **effort**: M
- **เผื่ออนาคต**: scope generic → ลาย/job_type target ฟรี; pacing เป็น function → swap seasonality forecast ภายหลัง; เผื่อ commission calc

#### M1.5 Drill-down จากทุก aggregate
- **ทำอะไร**: ทุกแถว/bar กดได้ → ออเดอร์/SKU ที่ประกอบเลขนั้น (channel→orders, ลาย→sizes/customers, กำไร→loss orders, customer→360). desktop side drawer, มือถือ full-screen + breadcrumb
- **ทำไม**: รายงานปัจจุบันเป็น dead-end — เห็น "สิริกานต์ขายดี" แต่กดดูไม่ได้ว่าออเดอร์ไหน/ลูกค้าไหน → ทำต่อไม่ได้. drill-down = สะพานจาก "อะไร" สู่ "ทำไม"
- **UI/UX**: ทั้งแถวเป็น tap target ≥48px (ไม่ใช่ chevron จิ๋ว, ไม่ hover-only); panel reuse card/table styling; filter state ใน URL hash → แชร์/back ได้; ปุ่ม "ส่งออก CSV" ในรายการ drill
- **ข้อมูล**: filter `fo`/`fs` ที่โหลดอยู่แล้ว client-side (ไม่มี query เพิ่ม); ต้อง order_no บนแถว (มีแล้ว)
- **effort**: M
- **เผื่ออนาคต**: `drillTo(dimension, value)` generic + filter-stack `{dimension,value}[]` → dimension ใหม่ = zero drill code; URL-encoded = ฐาน saved view/deep link

#### M1.6 Settlement reconciliation (กระทบยอดเงินเข้าจริง)
- **ทำอะไร**: อัปโหลด payout/settlement (Shopee/Lazada/TikTok) จับคู่ order_no → 3 คอลัมน์: ยอดขาย(GMV) → ค่าธรรมเนียมจริง → เงินเข้าจริง. flag mismatch เกิน threshold + take-rate% จริง + status settled/pending/reserve
- **ทำไม**: dashboard โชว์ยอดเต็มแต่เงินเข้าน้อยกว่า; ร้านต้องรู้ "ได้เงินครบไหม" — `mkt_net_income` เก็บไว้แต่ไม่เคย cross-check กับจริง
- **UI/UX**: แท็บ "กระทบยอดเงินเข้า" ตาราง 3 คอลัมน์ + chip สถานะ + ปุ่ม "เฉพาะที่ไม่ตรง" + KPI "ยังไม่ได้รับ ฿X จาก N ออเดอร์". reuse import wizard. มือถือ การ์ดต่อออเดอร์
- **ข้อมูล**: `tmk_mp_settlements` keyed order_no + `settlement_status` บน orders (M4)
- **effort**: L
- **เผื่ออนาคต**: fee เป็น JSON breakdown ต่อบรรทัด (referral/transaction/shipping/affiliate/voucher) ไม่ใช่ก้อนเดียว → รองรับโครงค่าธรรมเนียมเปลี่ยนทุกปี; pattern เดียวกับ COD reconciliation

#### M1.7 Action Center / Daily snapshot (มือถือ)
- **ทำอะไร**: feed บนสุดรวมทุกสัญญาณเป็น ranked dismissible cards: "สั่งผลิตด่วน N ลาย", "overstock จม ฿X", "ช่อง Y ต่ำกว่าเป้า", "ลายโต +30%", "ลูกหนี้เกินกำหนด", "OEM ถึงกำหนดส่ง". แต่ละ card บอก why + 1-tap action
- **ทำไม**: เจ้าของไม่ใช่สายเทค บนมือถือ ไม่ขุด 6 ตาราง — surface 3-5 สิ่งที่ต้องตัดสินใจวันนี้ = เปลี่ยน analytics เป็นเครื่องมือรายวัน
- **UI/UX**: stacked alert cards (reuse warn-row pattern StockView) + severity color + count badge + inline action; collapsible; remember dismissal ต่อวัน
- **ข้อมูล**: aggregator เหนือ metric ที่คำนวณแล้ว
- **effort**: M
- **เผื่ออนาคต**: แต่ละ alert = rule function `detect(agg, prevAgg) → {severity, title, action, link}` → rule ใหม่เสียบได้ไม่แตะ layout; feed เดียวกัน drive LINE push ภายหลัง

#### M1.8 Province / geo rollup + concentration
- **ทำอะไร**: region rollup (เหนือ/อีสาน/กลาง/ใต้/กทม.) shaded by sales + PoP growth; concentration "รายได้จาก 5 จังหวัดแรก NN%"; customers + CLV ต่อจังหวัด. แตะ region → province → orders
- **ทำไม**: province เก็บแล้วโชว์แค่ flat top-10. regional เผยตลาดเกิดใหม่ + จัด ads + priority อปท ต่อภาค
- **UI/UX**: region bar/segbar (มือถือ default) + optional SVG Thailand map (desktop, progressive enhancement)
- **ข้อมูล**: `byProv` มีอยู่ + lookup province→region (1 constant)
- **effort**: S (rollup) / L (map)
- **เผื่ออนาคต**: lookup table → district-level ภายหลัง; map อ่าน aggregated data เดิม no rework

---

### 🟡 P2 — ความครบถ้วนเชิงปฏิบัติการ

#### M2.1 OEM/ราชการ pipeline (quote→produce→deliver→invoice→collect) + tiered pricing + AR
- **ทำอะไร**: `tmk_oem_jobs`+`tmk_oem_lines` — job มี customer(หน่วยงาน), quoted_price, MOQ, ลาย×สี×ไซซ์ matrix, PO_no, stages (สอบถาม→เสนอราคา→รออนุมัติ→ยืนยัน→ผลิต→ส่งมอบ→วางบิล→เก็บเงิน). **tiered pricing** ต่อ qty break + contract price ต่อหน่วยงาน + MOQ warning. **AR/ลูกหนี้**: credit term (Net 30/60/90/มัดจำ%), invoice/due/paid, aging buckets, VAT 7% + WHT 3%
- **ทำไม**: งานราชการ project-like — long lead, milestone payment, contract — แทนใน order schema ไม่ได้. ~60% B2B invoice จ่ายช้า; เจ้าของ finance fabric lot ต้องเห็น AR ค้าง
- **UI/UX**: kanban stage board (reuse Planner card language) / มือถือ stage-grouped list + ▲▼ move; matrix ordering (RepSpark-style) sticky คอลัมน์แรก; quote → PDF; "ลูกหนี้" card aging bar (0-30 เขียว/31-60 เหลือง/60+ แดง) + "ทวงแล้ว" marker
- **ข้อมูล**: ตารางใหม่ + payment เป็น child rows (partial collection) + tiers JSON บน product + `tmk_b2b_price_contracts`
- **effort**: L
- **เผื่ออนาคต**: stages เป็น config array (เพิ่ม QC/ปัก); resolution order contract→tier→retail ใน pricing helper เดียว; idempotent import (deal id)

#### M2.2 Returns/RMA + return rate by ลาย/ไซซ์/ช่อง
- **ทำอะไร**: `tmk_mp_returns` — บันทึกคืนต่อ order/SKU + reason code (ไซซ์ไม่พอดี/สีไม่ตรง/ชำรุด/ส่งผิด/เปลี่ยนใจ) + type (refund/exchange/credit/returnless) + restock flag. หักยอดคืนจากสุทธิทุกแท็บ. return rate% ต่อลาย/สี/ไซซ์/ช่อง
- **ทำไม**: เสื้อผ้าออนไลน์คืน 20-40%, ~70% เพราะไซซ์ — ไม่หักคืน = กำไรเกินจริง. "สิริกานต์ XL คืนเยอะ" → แก้ตารางไซซ์/QC ต้นทาง
- **UI/UX**: wizard รับคืน (order→SKU→reason→ปลายทางสต็อก); ตาราง "อัตราคืนตามลาย/ไซซ์" เรียง+bar; KPI อัตราคืน; ไซซ์เกิน threshold = แดง "ตรวจสอบไซซ์"
- **ข้อมูล**: `status`/`return_amount` (M3) + ตาราง returns
- **effort**: L
- **เผื่ออนาคต**: reason code เป็น lookup แก้ใน Settings; partial refund + หลายชิ้น/ออเดอร์; `normalizeStatus()` map ต่อ platform → platform ใหม่เสียบได้

#### M2.3 Forecast (moving-average/run-rate) + seasonal index + reorder + dead-stock
- **ทำอะไร**: forecast ต่อลาย/ช่อง = 4-week MA / trailing-3-month + run-rate MTD projection. **seasonal index** ต่อเดือน = (avg เดือนนั้น ÷ avg รวม)×100, seed peak ไทย (สงกรานต์ เม.ย., ปีใหม่ พ.ย.-ธ.ค., งบราชการ ก.ย./ต.ค.). **reorder** ROP/safety stock. **dead-stock + overstock** (still-selling but over-bought >120 days cover) + lost-sales estimate (velocity × days-out × price)
- **ทำไม**: เห็นแต่อดีต → forward number ("คาดเดือนนี้ ~420 ตัว, กนก +18%") ให้พิมพ์ก่อน demand. 2 demand engine ทั้งคู่ seasonal. dead-stock (มี) แต่ขาด overstock + lost-sales
- **UI/UX**: dashed forecast segment บน monthly Bars; คอลัมน์ "คาดเดือนหน้า" + trend arrow ใน Top-ลาย; 12-month ปฏิทินฤดูกาล heat-strip; KPI "เสียโอกาส ฿X" + "สต็อกเกิน ฿Y จม"
- **ข้อมูล**: `monthlyArr` มีอยู่; ต้อง day-grain + stock join (M0.1, M0.4)
- **effort**: M / L (full)
- **เผื่ออนาคต**: forecast = pure function `(history[], method)` → swap seasonality/ML ภายหลัง; festival config แก้ได้ (เพิ่ม 9.9/11.11/12.12); index refine ทุกปี; forecast accuracy (MAPE + bias) snapshot ต่อเดือน → self-correcting safety stock

#### M2.4 Promotions/ส่วนลด + ผลต่อมาร์จิ้น
- **ทำอะไร**: ผูก Campaigns เดิมกับยอดจริง — บันทึกโปร (โค้ด/ช่วง/ช่อง/ส่วนลด) → ยอดช่วงโปร, ส่วนลดรวม, มาร์จิ้นหลังลด, break-even, เตือนเมื่อโปรกินกำไรขาดทุน
- **ทำไม**: มาร์จิ้นเสื้อผ้า 50-65% — ลดลึกเกิน = ขายดีแต่ขาดทุน; แยก "เพิ่มยอดจริง" vs "แจกส่วนลดให้คนที่จะซื้ออยู่แล้ว"
- **UI/UX**: ตารางแคมเปญ + คอลัมน์ มาร์จิ้นหลังลด/สถานะกำไร (เขียว/แดง) + เส้น break-even
- **ข้อมูล**: promo entity ผูก order (โค้ด/ช่วง/SKU) — promo code ลง attrs (M1) ก่อน
- **effort**: M
- **เผื่ออนาคต**: tiered discount + attribution ละเอียดขึ้น

#### M2.5 Saved views + Report builder + Export hub
- **ทำอะไร**: (a) **Saved views** `tmk_mp_views` — บันทึก `{range, lens, compare, tab, sort, v}` เป็น named view, chips บนสุด, seed 3 view; (b) **Report builder** — เลือก Dimension (ช่อง/ลาย/สี/ไซซ์/จังหวัด/เซลล์/job_type/payment/attrs key) × Measure (ยอด/กำไร/ชิ้น/ออเดอร์/AOV) cap 2 มิติ; (c) **Export hub** — CSV/Excel ของ view ที่ filter อยู่ + branded PDF "สรุปสิ้นเดือน" (โลโก้ Juntakarn, A4, Thai font)
- **ทำไม**: รายงานโตขึ้น → owner ทำ setup ซ้ำ; pick-2 builder ตอบคำถามใหม่ไม่ต้องเขียนโค้ด; PDF/CSV ส่ง LINE ให้หุ้นส่วน/บัญชี/หน่วยงานราชการ
- **UI/UX**: chip row "มุมมองที่บันทึก" + บันทึก/rename/delete; การ์ด "สร้างรายงานเอง" 2 dropdown; ปุ่ม "ส่งออก" menu (CSV/Excel/PDF) + "ส่งออกตามฟิลเตอร์ปัจจุบัน"
- **ข้อมูล**: serialize useState (month/tab/lens/compare); export อ่าน selector เดียวกับหน้าจอ
- **effort**: M
- **เผื่ออนาคต**: view = JSON definition (มี `v` field) → filter ใหม่ degrade gracefully; export schema versioned (stable column contract) → Sheet/integration ไม่พัง; PDF component → scheduled/share link reuse; downloadCSV มี formula-injection guard อยู่แล้ว

#### M2.6 Anomaly detection (post-import) + States + Pro data table
- **ทำอะไร**: (a) z-score (±2.5-3) + rule flags หลัง import → banner "สิ่งที่ควรดู" (ยอด Lazada −62%, margin ลาย drop); (b) skeleton loading / empty state สอน / error actionable (`<BlockState>`); (c) DataTable: sort header, sticky, density toggle, column show/hide, pagination 25, filter chips
- **ทำไม**: file-import ไม่มี live monitoring — bad data/business shift นั่งเงียบ; blank screen = "ระบบเสีย?"; ตาราง CRM/ลาย จะโต thousands rows
- **UI/UX**: banner dismissible deep-link; skeleton shimmer; empty = icon+ไทย 1 บรรทัด+ปุ่ม; error = สาเหตุไทย+ลองอีกครั้ง (generalize migration-aware error ที่มีอยู่); `<DataTable columns rows>` config-driven, persist localStorage
- **effort**: M / S (states)
- **เผื่ออนาคต**: rule registry; `<BlockState>` wrapper ทุก block; DataTable component เดียว reuse ทุกโมดูล → ฐาน saved view

---

### 🟢 P3 — เผื่ออนาคต/ขยายทีม

| โมดูล | ทำอะไร | effort |
|---|---|---|
| **M3.1 Roles (viewer/editor/admin)** | JWT custom claim (Supabase Custom Access Token hook) gate import/delete/financial — ไม่ใช่แค่ `window.__isAdmin`. UI-gate เดิมเป็น convenience layer | M |
| **M3.2 Server-side rollups** | `tmk_mp_monthly` materialized → ไม่โหลด 50k+120k ลงมือถือ; raw on drill-down only | L |
| **M3.3 Scheduled monthly digest** | pg_cron/Edge → LINE/email สรุปไทย (ยอด/กำไร/top3 ลาย/MoM/anomaly) วันที่ 1 | L |
| **M3.4 Identity merge ข้ามช่อง** | รวมลูกค้าเบอร์/ชื่อ/social ซ้ำ → 1 profile (TikTok ไม่มีตัวตน handle gracefully); `customer_master_id` one-to-many merge/unmerge | L |
| **M3.5 Customer-by-channel + overlap** | per-channel customer count/repeat/AOV/CLV + multi-channel customer count (มี channels Set แล้ว) | M |
| **M3.6 Audit log extend + Export contract + Offline PWA read** | wire `logAudit()` เข้า mp import/view/export; versioned CSV/JSON + webhook seam; cache last report offline ("ข้อมูล ณ [time]", import disabled offline) | S each |
| **M3.7 Command palette + VIP tiers + Acquisition trend + Demand-by-new/returning** | ⌘K nav; ทั่วไป/เงิน/ทอง/เพชร tier (Pareto); new-customer/month bar; ลายประจำ(ซื้อซ้ำสูง) vs ลายดึงลูกค้าใหม่ | S-M |

---

## 5. UI/UX System

### 5.1 หลักเลือกชาร์ต (decision-driven, ห้าม pie >4 slice)
| ความตั้งใจ | ชาร์ต | ใช้กับ |
|---|---|---|
| เปรียบเทียบหมวด | bar | ช่องทาง, ลาย, สี |
| แนวโน้มเวลา | line (+ overlay งวดเทียบ ~40% opacity) | ยอดรายเดือน |
| เป้า vs จริง | bullet bar (fill + target tick + pace marker) | เซลล์ quota, monthly goal |
| pipeline | funnel | new→returning→loyal, OEM stages |
| density เวลา | heatmap | cohort, weekday/hour, size×color, RFM 5×5 |
| สัดส่วน | 100% stacked bar (แทน donut 7 ช่อง) | channel share |

- SVG inline น้ำหนักเบา (style เดิม), dependency-free, มือถือไหว
- ทุก chart มี **"ดูเป็นตาราง" fallback** (a11y + เลขเป๊ะ) + direct label บน bar (ไม่ legend แยกบนมือถือ)
- chart-type registry: metric→component (`'comparison'|'trend'|'target'|'pipeline'|'density'`) กัน chart sprawl

### 5.2 ตาราง
- DataTable: sort header (arrow), sticky header + sticky คอลัมน์แรก, density toggle (กระชับ/ปกติ/โปร่ง), column show/hide, pagination 25 (10/25/50/100), "แสดง 25 จาก 1,240", filter chips ลบรายตัว, num right-align + thousand sep (`N()`/`B()`), persist localStorage

### 5.3 สี & accessibility
- semantic data palette เป็น CSS token แยกจาก good/bad/accent UI token: categorical (7 ช่องมีสีคงที่ — Shopee = ส้มเดิมทุกที่) + sequential single-hue (heatmap)
- WCAG: 4.5:1 text, 3:1 chart element; verify dark **และ** light
- **dual-encoding**: สี + cue ที่ 2 (icon/label/+−) เสมอ — ~8% ชายตาบอดสี; grayscale-safe palette

### 5.4 มือถือ + states
- การ์ด 2-up, แถว ≥48px, ฟิลเตอร์ ≤6 แตะ, modal mobile-fixed (แก้แล้ว), share-sheet friendly
- empty/loading/error first-class ทุก block (`<BlockState>`); skeleton แทน spinner
- dark/light ผ่าน token เดิมทั้งหมด

---

## 6. Roadmap (เฟสการสร้างจริง)

### ✅ เฟส 0 — Backbone (เสร็จแล้ว)
pipeline mpReport.js · 2 ตาราง mp + CRM fields · MpReportView (KPI/ช่อง/ลาย/สี/ไซซ์/เซลล์/จังหวัด/ชำระ/ใหม่-เก่า/แนวโน้ม) · CRM tab (top spender/loyal/repeat) · SalesReportView (sell-through/velocity/aging/dead-stock/ABC/suggestPO) · CSV import wizard · PWA · audit log

### 🔴 เฟส 1 — Foundation & Trust (P0, ทำก่อนทุกอย่าง)
**M0.1** JSONB attrs + day-grain + keep-cancelled → **M0.7** validation gate → **M0.6** import ledger + rollback → **M0.2** PoP + waterfall + net KPI → **M0.5** channel net margin
> *เหตุผลลำดับ*: data foundation เป็น one-way door; ledger/validation ปกป้อง master ก่อนใส่ของหนัก; แล้วค่อยทำ KPI ที่พึ่ง foundation

### 🟠 เฟส 2 — Decision Core (P0/P1)
**M0.3** ลาย/sell-through/size curve/colorway → **M0.4** stock join + production board → **M1.5** drill-down → **M1.3** job-type lens → **M1.1** RFM/LTV/win-back/360

### 🟡 เฟส 3 — Management Tools (P1)
**M1.2** cohort/repeat → **M1.4** targets/pacing → **M1.7** action center → **M1.6** settlement reconciliation → **M1.8** geo

### 🟢 เฟส 4 — Operational Completeness (P2)
**M2.1** OEM pipeline/AR/pricing → **M2.2** returns → **M2.3** forecast/seasonal/reorder → **M2.5** saved views/builder/export → **M2.4** promotions → **M2.6** anomaly/states/datatable

### ⚪ เฟส 5 — Scale & Future (P3)
**M3.2** server rollups (เมื่อข้อมูลโต) → **M3.1** roles (เมื่อมีทีม) → **M3.3** digest → **M3.4-3.7** identity/channel/audit/palette/tiers

---

## 7. เผื่ออนาคต (ออกแบบตอนนี้กันรื้อ) + migration ที่ต้องเตรียม

### 7.1 การตัดสินใจที่ต้องทำ "ตอนนี้" (มิฉะนั้นบังคับ re-import/รื้อทีหลัง)
1. **JSONB `attrs`** ทุก master table — typed spine + JSONB tail (M1)
2. **`order_date` day-grain** — เก็บวันที่จริง (mpReport parse อยู่แล้วแต่ทิ้ง) (M2)
3. **เก็บ cancelled/returned** แทน `continue` ทิ้ง + `status` column (M3) — one-way door
4. **append-only import ledger** — projection rebuildable
5. **filter-stack แบบ serializable** (`{dimension,value}[]` + URL hash/JSON) — ฐานของ drill-down + saved view + deep link + scheduled report ทั้งหมด
6. **pure-function pipeline** (mpReport.js) — web/export/Sheet อ่าน source เดียว; recompute idempotent
7. **config-driven thresholds** (RFM cutoff, sell-through band, ROP lead time, margin threshold, season calendar) — แก้ไม่ต้องแตะโค้ด
8. **JWT role claim** ใส่ตอนนี้แม้ RLS ปิด — เปิด RLS ภายหลังไม่ต้อง re-architect auth
9. **versioned export schema** (`schema_version` header) — downstream ไม่พังเมื่อเพิ่มคอลัมน์
10. **generic helpers**: `compareAgg()`, `drillTo()`, `cohortBy(field)`, `deriveJobType()`, `designSellThrough()`, ROP helper — reuse + swap implementation ฟรี

### 7.2 Migration ที่ต้องเตรียม (ทั้งหมด `if not exists` + grant + disable RLS)
```
M1  attrs jsonb บน tmk_mp_orders, tmk_mp_skus
M2  order_date date บน tmk_mp_orders, tmk_mp_skus (+ backfill ตอน re-import)
M3  status/return_amount/refund_reason บน tmk_mp_orders
M4  settlement_status/settled_amount บน tmk_mp_orders
ใหม่: tmk_mp_import_batches, tmk_mp_monthly(rollup), tmk_mp_returns,
      tmk_mp_settlements, tmk_targets, tmk_mp_views, tmk_oem_jobs+lines,
      tmk_b2b_price_contracts, tmk_mp_size_curve, tmk_mp_alerts
GIN index บน attrs เมื่อ key hot
```

---

## 8. สรุปสำหรับเจ้าของร้าน (อ่าน 1 นาที)

ระบบนี้คือ **"ผู้ช่วยขายในมือถือ"** ที่อยู่ในหน้า "รายงานสินค้า" (catalog) — คุณ export ไฟล์ขายจาก Shipnity/Shopee/TikTok แล้วอัปโหลด ระบบจะรวมทุกช่องทางเป็นภาพเดียว แล้วบอกคุณว่า:

- **ขายดีขึ้นหรือแย่ลง?** ทุกตัวเลขมีลูกศรเขียว/แดงเทียบเดือนก่อน/ปีก่อน
- **ได้เงินจริงเท่าไหร่?** เห็นชัดว่าจากยอดบิล 100 บาท หลังหักค่าธรรมเนียม Shopee/Lazada, ของคืน, ต้นทุน เหลือกำไรจริงกี่บาท — แยกตามช่องทาง (POS/LINE กำไรดีกว่า Shopee เสมอ)
- **ต้องสั่งผลิตลายไหน?** ระบบเชื่อมยอดขายกับสต็อกที่เหลือ บอก "สิริกานต์ขายดี เหลือพอ 9 วัน — รีบผลิต 100 ตัว" พร้อมสัดส่วนไซซ์/สีที่ควรตัด
- **ลูกค้าคนไหนควรทักวันนี้?** แบ่งลูกค้าเป็นกลุ่ม (แชมป์/ประจำ/กำลังจะหาย/หลับไปแล้ว) พร้อมลิสต์ "ควรตามกลับ" + ปุ่มคัดลอกเบอร์/LINE
- **ทีมขายทำได้ตามเป้าไหม?** ตั้งเป้าต่อคน เห็นกลางเดือนว่าใครจะถึง/ไม่ถึง
- **งานราชการ (อปท/สพฐ/กระทรวง) แยกชัด** — ใบเสนอราคา → ผลิต → ส่งมอบ → วางบิล → เก็บเงิน พร้อม "ลูกหนี้ค้างชำระ" ที่เกินกำหนดขึ้นสีแดง

ทุกอย่าง **ปลอดภัย**: อัปไฟล์ผิด/ซ้ำ กดย้อนกลับได้เอง · ทุกตัวเลขย้อนได้ว่ามาจากไฟล์ไหน · ทำงานบนมือถือแม้เน็ตไม่ดี · ออกแบบให้ใช้ได้ยาวหลายปีโดยไม่ต้องสร้างใหม่

**ลำดับสร้าง**: ① วางฐานข้อมูลให้แน่น (เก็บวันที่/ของคืน/ประวัตินำเข้า) → ② เห็นกำไรจริง + เทียบงวด → ③ เชื่อมสต็อก-ผลิต + ลูกค้า RFM → ④ เป้าเซลล์ + กระทบเงินเข้า → ⑤ งาน OEM + คืนสินค้า + พยากรณ์ → ⑥ ขยายทีม/ระบบใหญ่ขึ้น

---

ไฟล์อ้างอิงในโค้ดเบส (absolute path):
- `/Users/artist/Documents/TMK Operation/src/lib/mpReport.js` — pure pipeline (จุดแก้ M0.1: เก็บ order_date, ไม่ทิ้ง cancelled)
- `/Users/artist/Documents/TMK Operation/src/views-2.jsx` — `MpReportView` (บรรทัด 526, agg บรรทัด 553), `SalesReportView` (1164, sell-through 1265, aging 1282, deadStock 1318), `StockView` (954, suggestPO 969), `downloadCSV` (1145, มี formula-injection guard), `productDesign()` (807), `ReportHub`/`CatalogView` (787)
- `/Users/artist/Documents/TMK Operation/supabase/migrations/20260622-mp-report.sql` + `20260622b-mp-customers.sql` — schema ปัจจุบัน (จุดเพิ่ม M1-M5)
- `/Users/artist/Documents/TMK Operation/src/lib/audit.js` — `logAudit()` (reuse M3.6)
