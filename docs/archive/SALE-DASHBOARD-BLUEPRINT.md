# Blueprint: Sales Dashboard เต็มระบบ (Juntakarn) — หน้า "Sale"

> รีวิวก่อน implement · อิงข้อมูลจริงใน Supabase (audit 2026-06-23) · ปรับ spec ให้เข้ากับ stack จริงของแอป

---

## 0) การตัดสินใจเรื่อง stack (สำคัญสุด — ขอยืนยันก่อน)

spec ที่ส่งมาเสนอ stack แยก: React+**TypeScript**+Tailwind+shadcn+**Recharts**+**DuckDB-wasm**+static JSON
**แต่แอปนี้คือ:** React 19 (ไม่มี TS) + Chart.js + Supabase + custom CSS (ตัวแปรธีม) + ข้อจำกัด "แก้เฉพาะหน้า Sale"

**ข้อเสนอ → ทำในแอปเดิม (ไม่ greenfield):**
| spec แนะนำ | ใช้จริงในแอป | เหตุผล |
|---|---|---|
| TypeScript | JS (เดิม) | ทั้งแอปเป็น JS · ไม่ rewrite |
| Tailwind/shadcn | custom CSS vars (เดิม) | ธีม dark/light มีอยู่แล้ว |
| Recharts/ECharts | Chart.js (`charts.jsx` เดิม) | reuse ของเดิม + เพิ่มชนิดกราฟ |
| DuckDB-wasm + static JSON | Supabase + aggregate ฝั่ง client | ข้อมูล **3,377 SKU / 1,997 ออเดอร์** เล็กมาก — JS group ไหวสบาย ไม่ต้อง DuckDB |
| URL-synced (nuqs) | URL query params เอง | เพิ่มได้ ไม่ต้องลง lib |

> ✅ **reconcile แล้ว:** ข้อมูลใน DB = 1,902 ออเดอร์ active / ฿679,471 / 3,377 ชิ้น (ตรง README §12)

---

## 1) Data model จริง (audit แล้ว — ห้ามเดา)

### `tmk_mp_orders` (grain = 1 ออเดอร์, 1,997 แถว / active 1,902)
| field | coverage | ใช้ได้ |
|---|---|---|
| `order_date` (date) | **100%** · 2026-05-01→06-22 (53 วัน) | ✅ แกนเวลาหลัก |
| `channel` | 100% (8 ค่า) | ✅ |
| `salesperson` | 100% (7 คน) | ✅ |
| `province` | 100% (171 ค่า) | ✅ geo |
| `payment_type` | 100% (5 ค่า) | ✅ |
| `customer_type` | 100% (ใหม่/เก่า/ไม่ทราบ-TikTok) | ✅ |
| `job_type` | **100%** (ปลีก/ส่ง/OEM) | ✅ *(spec บอกว่าง — จริงๆ เรา derive มาแล้ว ดีกว่า)* |
| `qty_band` | 100% (5 ระดับ) | ✅ |
| `qty`,`sales` | 100% | ✅ |
| `profit` | 69% | ⚠️ TikTok=0 → badge เตือน |
| `cost` | 39% | ⚠️ margin เฉพาะช่องมี cost |
| `mkt_commission`/`mkt_net_income` | 32%/37% | ⚠️ เฉพาะ Shopee |
| `cod_amount` | 13% | ⚠️ |
| `customer_code`/`customer_name` | 70%/69% | ⚠️ RFM ได้ ~70% |
| `cust_total_orders`/`cust_total_spent` | 70% | ⚠️ |
| `return_amount`/`settlement_status`/`settled_amount` | **0%** | 🔜 ยังไม่ import |
| `status` | active/cancelled (95 ยกเลิก) | ✅ cancel rate |

### `tmk_mp_skus` (grain = 1 บรรทัด, 2,877 แถว)
`design`(55) · `color`(31) · `size`(22, มีขยะปน เช่น `4xl`/`ไซส์2XL(อก46")` → ต้อง normalize ตอนแสดง) · `product_code`(55) · `qty`(แม่นสุด) · `line_sales`(Shopee/TikTok เป๊ะ, Shipnity=เฉลี่ย) · `match_how` · `attrs.flag`(ลายใหม่/สีใหม่)

### lookup ที่ต้องเตรียม
- **`catalog.type`** (เสื้อโปโล/กระเป๋า/ของแถม…): catalog **ไม่ได้อยู่ใน DB** → สร้าง static map `product_code → type` จาก `catalog.csv` (86 แถว) ฝังเป็นไฟล์ `src/lib/catalogMeta.js` (ไม่ต้อง migration)
- **`tmk_targets`**: มีตารางแล้ว → KPI เทียบเป้าใช้ได้

---

## 2) Time engine (วัน/สัปดาห์/เดือน/ไตรมาส/custom)

**สร้าง `src/lib/saleTime.js`** (pure, เทสได้):
- `bucketKey(date, gran)` → gran ∈ day|week|month|quarter; week=ISO (จันทร์ต้นสัปดาห์), label `W22 (26 พ.ค.–1 มิ.ย.)`; quarter `Q2/2026`
- `presets`: วันนี้ · 7 วัน · 30 วัน · เดือนนี้ · ไตรมาสนี้ · YTD · ทั้งหมด
- `prevPeriod(range)` → ช่วงก่อนหน้ายาวเท่ากัน (PoP) · `prevYear(range)` (YoY)
- tz Asia/Bangkok (order_date เป็น date อยู่แล้ว ไม่มีปัญหา tz)

**⚠️ ข้อจำกัดข้อมูลจริง (ต้องบอกผู้ใช้ใน UI):**
- มี **53 วัน / 9 สัปดาห์ ISO / 2 เดือน / 1 ไตรมาส** → day/week/custom สวยเต็มที่; month มี 2 จุด; quarter มี 1 จุด (โตเองเมื่อข้อมูลเพิ่ม)
- **YoY ทำไม่ได้** (ไม่มีข้อมูลปี 2025) → ปุ่ม YoY ขึ้น "ยังไม่มีข้อมูลปีก่อน"; **PoP ใช้ได้เต็ม**

---

## 3) KPI cards (12 ตัว, 2 แถว) — ค่า + %Δ(PoP) + sparkline

**แถว A ขาย:** ① ยอดขายรวม ② ออเดอร์ ③ ชิ้น ④ AOV(sales/orders) ⑤ ราคา/ชิ้น(sales/qty) ⑥ กำไร+margin% ⚠️
**แถว B พฤติกรรม:** ⑦ ใหม่vเก่า % ⑧ COD vจ่ายก่อน % ⑨ Marketplace vช่องตรง % ⑩ ออเดอร์ก้อนใหญ่(band≥11) ⑪ ค่าคอม+ฟี รวม+% ⚠️ ⑫ #ช่อง/#ลาย/#จังหวัด active
ทุก card: ค่า + ค่าช่วงก่อน(เล็ก) + %Δ สี + sparkline ตาม granularity. ⚠️ = badge "เฉพาะช่องมีต้นทุน"

---

## 4) Sections S1–S9 (กราฟ + สถานะความพร้อม)

| # | Section | กราฟ | สถานะ |
|---|---|---|---|
| S1 | เทรนด์ตามเวลา | combo (แท่งยอด+เส้นออเดอร์) + เส้นเทียบช่วงก่อน + toggle metric + annotate hi/lo | ✅ |
| S2 | ช่องทาง | stacked-bar/เวลา + donut + ตาราง(ยอด/ออเดอร์/ชิ้น/AOV/กำไร/%share/%Δ) + heatmap ช่อง×สัปดาห์ + insight โต/หด | ✅ |
| S3 | ลาย/สินค้า (หัวใจ) | bar TopN (toggle ชิ้น/ยอด/กำไร) + matrix ลาย×ช่อง(heat) + Top/Bottom movers + filter type + **drill ลาย→สี/ไซซ์/ช่อง** | ✅ (treemap→ทำเป็น grouped bar, Chart.js ไม่มี treemap native) |
| S4 | สี & ไซซ์ | bar ไซซ์(เรียง XS→8XL, normalize ขยะ) + bar/donut สี + **matrix สี×ไซซ์ heatmap** | ✅ |
| S5 | ชำระเงิน/การเงิน | donut payment + เส้น COD ratio/เวลา + bar ค่าคอม/ฟีต่อช่อง + กำไรขั้นต้น/ช่อง(ซ่อนช่อง cost=0) | ⚠️ การเงินบางส่วน (cost 39%) |
| S6 | ลูกค้า | ใหม่vเก่า/เวลา(stacked) + กระจาย qty_band + **RFM/repeat/top ลูกค้า** | ⚠️ RFM ~70% (customer_code) |
| S7 | ภูมิศาสตร์ | **bar จังหวัด Top15** (ทำได้เลย) + แยก POS · **choropleth แผนที่ไทย** | bar ✅ / choropleth 🔜 (ต้องลง `chartjs-chart-geo` + TH topojson) |
| S8 | ทีมขาย | bar เซลล์ + leaderboard %Δ (เฉพาะออเดอร์เปิดเอง) | ✅ |
| S9 | ตารางออเดอร์ดิบ | sort ทุกคอลัมน์ + filter + ค้นหา + pagination + sticky + **drawer→sku ของออเดอร์** + export | ✅ (ใช้ MpOrdersView เดิมต่อยอด) |

---

## 5) Global filters (ใช้ร่วมทุก section)

มัลติซีเลกต์+ค้นหา: เวลา · channel · payment_type · customer_type · qty_band · design/product_code · catalog.type · size · color · province · salesperson · source
- filter chips + ล้างทั้งหมด
- **URL query params** (รีเฟรช/แชร์คงค่า) — เพิ่มใน Sale page เท่านั้น
- **cross-filter:** คลิกชิ้นกราฟ → กรองทั้ง dashboard (เช่น คลิก Shopee → ทุก section เหลือ Shopee)

---

## 6) Sort / Ranking (ทุกตาราง)
sort หลายคีย์ + toggle วัด(ชิ้น/ยอด/กำไร/ออเดอร์/AOV/%Δ) + Top/Bottom N + "ดาวรุ่ง/ดาวร่วง"(เรียง %Δ) + Pareto 80/20 + เส้นสะสม%

---

## 7) UX
responsive(desktop หลัก) · dark/light(มีแล้ว) · tooltip+drill+hover · skeleton+empty state · ไทยทั้งหมด · เลข ฿+comma · พ.ศ./ค.ศ. · export CSV(มีแล้ว)/PNG-PDF(🔜) · มุมขวาบน: ช่วงที่ดู + เวลาอัปเดต

---

## 8) สถาปัตยกรรมโค้ด (ในแอปเดิม)

```
src/lib/saleTime.js     ← time bucket/preset/compare (pure, มี node test)
src/lib/saleAgg.js      ← aggregate ทุกมิติ + sort/rank/Pareto/movers (pure, มี node test)
src/lib/catalogMeta.js  ← product_code → {type, price} (gen จาก catalog.csv)
src/charts.jsx          ← เพิ่ม ComboChart, StackedBars, Heatmap, ParetoChart, ProvinceBars
src/saleDashboard.jsx   ← SaleDashboard (แทน render เดิมของ MpReportView)
   ├─ GlobalFilterBar + TimeRangePicker (URL-synced)
   ├─ KpiGrid (12 cards)
   ├─ S1…S9 (component ละ section)
   └─ DrillDrawer (คลิกมิติ→detail)
```
ข้อมูล: fetch ครั้งเดียว (paginated, มี `fetchAllRows` แล้ว) → เก็บใน state → ทุก filter/agg ทำ client-side (เร็ว, ~3k แถว) → ไม่ยุ่ง DB เพิ่ม

---

## 9) Optional joins (เผื่ออนาคต — ออกแบบ field รองรับ ไม่มีก็รันได้)
1. ลูกค้า level → RFM/CLV/cohort (มี customer_code 70% เริ่มได้)
2. สต็อก variant → days-of-inventory (ต้อง import สต็อก)
3. TikTok settlement → เติม cost/profit (return/settlement schema มีแล้ว)
4. job_type — **มีแล้ว** (ปลีก/ส่ง/OEM)
5. ปฏิทินแคมเปญ (11.11/payday) overlay บนเทรนด์
6. เรตค่าส่ง/คอมจริงต่อช่อง → กำไรสุทธิจริง
7. เป้า/งบ → `tmk_targets` (มีแล้ว) actual vs target

---

## 10) ลำดับงาน (phase — ขอ approve ก่อนเริ่มแต่ละเฟส)
- **P0 Foundation:** saleTime.js + saleAgg.js + catalogMeta.js (+ node test reconcile ฿679,471) + กราฟใหม่ใน charts.jsx
- **P1 แกนหลัก:** TimeRangePicker + GlobalFilterBar(+URL) + KpiGrid(12) + S1 เทรนด์ + S3 ลาย (หัวใจ)
- **P2:** S2 ช่องทาง + S4 สี/ไซซ์ + cross-filter + drill drawer
- **P3:** S5 การเงิน + S6 ลูกค้า + S8 เซลล์ + S7 จังหวัด(bar)
- **P4:** S9 ตารางดิบ + sort/Pareto + export + polish + reconcile
- **P5 (stretch):** choropleth แผนที่ + PNG/PDF export + optional joins §9

---

## สรุปช่องว่าง (พูดตรง)
| spec ขอ | สถานะจริง |
|---|---|
| quarter / YoY | quarter=1 จุด, **YoY ไม่มีข้อมูลปีก่อน** (PoP ใช้ได้) |
| catalog.type filter | ต้อง gen static map (ไม่มี catalog ใน DB) |
| choropleth แผนที่ | ต้องลง dep + TH topojson → ทำเป็น phase stretch (bar จังหวัดได้เลย) |
| margin/กำไร/ค่าคอม | partial (cost 39%, TikTok=0) → badge เตือน |
| RFM/ลูกค้า | ~70% (customer_code) |
| returns/settlement | 0% → 🔜 รอ import |
| PDF/PNG export | 🔜 (CSV ได้เลย) |
| treemap | → grouped bar (Chart.js ไม่มี treemap) |
