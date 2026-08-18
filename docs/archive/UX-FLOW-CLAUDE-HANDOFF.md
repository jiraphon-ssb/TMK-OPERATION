# TMK Operation — UX / User Flow Handoff for Claude

วันที่ตรวจ: 2026-06-24  
ผู้ตรวจ: Codex  
ขอบเขต: user flow, usability, information architecture, mobile UX, feature clarity  
วิธีตรวจ: live in-app browser ที่ `http://127.0.0.1:5173/` + อ่านโครงเอกสาร/โค้ดประกอบ

## TL;DR

ระบบมีข้อมูลจริงและฟีเจอร์เยอะมากแล้ว แต่ UX ตอนนี้เริ่มมีปัญหาแบบ “ระบบเก่ง แต่คนต้องคิดเองเยอะ”

สิ่งที่ควรทำต่อไม่ใช่เพิ่มกราฟก่อน แต่ควรจัด flow ให้คนแต่ละบทบาททำงานจบได้เร็ว:

1. ทำ `Sale > ข้อมูล > สุขภาพข้อมูล` ให้เป็น flow เคลียร์คุณภาพข้อมูลแบบ checklist เพราะนี่เป็น prerequisite ของรายงานทั้งหมด
2. ทำ CRM ให้เป็น action queue สำหรับเซลล์ ไม่ใช่ตารางลูกค้า 1,280 ราย
3. แยกบทบาท `ยอดขาย` กับ `Sale` ให้ชัด เพราะตัวเลข/แหล่งข้อมูลต่างกัน
4. ทำ flow มือถือสำหรับ “กรอกยอด / ตามลูกค้า / ดูงานวันนี้” ให้เบากว่าหน้า desktop
5. แก้เสถียรภาพ UX จาก console error และ state ที่ทำให้ปุ่ม/flow บางจังหวะกดไม่ได้

## บริบทระบบปัจจุบัน

เมนูหลัก:

- หน้าหลัก
- ยอดขาย
- วางแผน
- Sale

`ยอดขาย` = operation dashboard เดิม:

- MTD
- เป้า
- pace
- งบโฆษณา
- P&L
- daily entry/status

`Sale` = sales intelligence ใหม่:

- รายงานขาย import-based
- ออเดอร์
- บันทึกขาย
- แคตตาล็อกเสื้อ
- CRM
- Import/export
- Data health / alias

## ตัวเลขสำคัญที่เห็นตอนตรวจ

### Home

- มีงานวันนี้
- ยังไม่บันทึกยอดขายวันนี้
- งานครบกำหนด/ค้าง 16 งาน
- ทีมออนไลน์ 1 คน
- activity feed มีข้อมูลจริง

### Sales เดิม

- ยอดขาย MTD: ฿810,637.27
- เป้า: ฿1,000,000
- ออเดอร์: 2,172
- AOV: ฿373.22
- Pace: ทันเป้า
- งบโฆษณาใช้ไป: ฿99,386.19 / ฿155,000

### Sale report ใหม่

- ยอดขายรวม: ฿735,866.94
- ออเดอร์: 1,898
- ชิ้น: 3,100
- ลูกค้า: 1,280
- ลูกค้าใหม่: 48%
- ช่องทาง: 8
- ลาย: 23
- จังหวัด: 78

### CRM

- ลูกค้าทั้งหมด: 1,280
- มีเบอร์/ติดต่อได้: 658
- คิวตามต่อ: 343
- เสี่ยงหลุด: 0

### Data Health

- SKU ทั้งหมด: 2,693
- จับคู่ลายได้: 93%
- มีรหัสลาย: 90%
- ต้องตรวจ: 35 กลุ่ม

## User Roles ที่ควรออกแบบแยก

### 1. Owner / CEO

ต้องการ:

- วันนี้ยอดเป็นยังไง
- เดือนนี้ทันเป้าไหม
- ช่องทางไหนดี/เสีย
- ลายไหนควรผลิต/ดัน
- ทีมขาย/เซลล์คนไหนควรช่วย

Pain ตอนนี้:

- ต้องข้ามระหว่าง `ยอดขาย` กับ `Sale`
- ตัวเลขสองหน้าต่างกันแต่ source label ยังไม่ชัดพอ
- Insight เยอะ แต่ next action ไม่ถูกสรุปให้

### 2. Sales / Admin คนกรอกยอด

ต้องการ:

- กรอกยอดเร็ว
- กรอกคนทัก
- เห็นรายการวันนี้
- แก้รายการผิดง่าย

Pain ตอนนี้:

- `Sale > บันทึกขาย` มี 12 input/control ในหน้าเดียว
- ปุ่ม `กรอกคนทักวันนี้` สำคัญ แต่ตอนทดสอบมีจังหวะที่คลิกไม่ได้/ไม่พร้อม
- ยังไม่มี micro-guidance ว่า field ไหนจำเป็นก่อนถึงบันทึกได้

### 3. Sales follow-up

ต้องการ:

- วันนี้ต้องตามใคร
- โทร/ทักแล้วจดผลได้
- นัดตามครั้งต่อไป
- เห็นประวัติซื้อและลายที่ลูกค้าชอบ

Pain ตอนนี้:

- CRM เป็นตาราง 300 แถวแรกจาก 1,280 ราย
- มี filter ดี แต่ยังไม่ใช่ action queue
- “คิวตามต่อ 343” ยังไม่แปลงเป็นงานที่ทำจบได้ทีละราย

### 4. Data / Import operator

ต้องการ:

- อัปโหลดไฟล์
- รู้ว่าไฟล์ขาดอะไร
- ตรวจ mapping ที่ผิด
- แก้ alias แล้วนำเข้าใหม่

Pain ตอนนี้:

- Import flow อธิบายดี แต่ Data Health ถูกซ่อนไว้เป็นแท็บข้าง ๆ
- Data Health สำคัญมาก แต่ยังดูเหมือนรายงานตรวจ ไม่ใช่ checklist งาน
- Alias เซลล์อยู่ใน Import page แต่ผลกระทบไปอยู่ที่รายงานทีมขาย/CRM

### 5. Marketing / Content planner

ต้องการ:

- เห็นงานวันนี้/สัปดาห์นี้
- ย้ายสถานะงาน
- ดูแคมเปญที่เสี่ยง/ค้าง

Pain ตอนนี้:

- Calendar แน่นมาก
- Kanban มี 40 งาน โดยรอดำเนินการ 39 งาน ทำให้ queue ล้น
- Timeline แสดง overdue จำนวนมาก แต่ยังไม่ได้สรุปว่า “ควรทำอะไรก่อน”

## Audit รายหน้า

## Home

สิ่งที่ดี:

- ทำหน้าที่ daily command center ได้ดี
- มี “โฟกัสวันนี้”
- มี digest เมื่อวานพร้อมปุ่มคัดลอก
- มี campaign status + team presence + activity feed

Pain:

- มีหลายสิ่งแข่งกันเป็น priority
- “ยังไม่บันทึกยอดขายวันนี้” เป็น action สำคัญ แต่ควรเด่นกว่า feed
- Activity feed ยาวและมี duplicate-looking events เช่น catalog test entries

แนะนำ:

- ทำ Top 3 action วันนี้:
  - กรอกยอดวันนี้
  - งานค้างสำคัญ
  - ลูกค้าที่ต้องตาม
- แยก activity feed เป็น secondary / collapsed
- ถ้าไม่มี action สำคัญ ให้โชว์ insight summary แทน

## Sales เดิม

สิ่งที่ดี:

- เหมาะกับ owner ดูเป้า/pace/งบ
- งบแอดอธิบายดี มี burn rate และ remaining/day
- Daily status ชัดว่ากรอกแล้ว 23/30 วัน

Pain:

- ตัวเลขไม่ตรงกับ `Sale report` เพราะ source ต่างกัน
- ผู้ใช้ไม่รู้ว่าควรดูหน้าไหนเป็น source of truth
- `P&L` บอก “ยังไม่ตั้งต้นทุนสินค้า %” แต่ action ไปตั้งอยู่ใน modal รายเดือน ไม่เด่นพอ

แนะนำ:

- Rename หรือ subtitle:
  - `ยอดขาย` → `ยอดขายรายวัน / เป้าเดือน`
  - `Sale` → `รายงานขายจากไฟล์ / CRM`
- ใส่ source chip ชัดเจน:
  - “ข้อมูลจากบันทึกยอดรายวัน”
  - “ข้อมูลจากไฟล์นำเข้า”
- CTA ใน P&L:
  - `ตั้งต้นทุนสินค้า %`
  - `ตั้งเป้าลูกค้าใหม่`

## Planner

สิ่งที่ดี:

- มี calendar / kanban / timeline ครบ
- Calendar บอกงานตามวันได้จริง
- Timeline เห็น campaign status และ overdue

Pain:

- Calendar cell แน่น อ่านยากเมื่อมีหลายงาน
- Kanban มี 39 งานในรอดำเนินการ ทำให้ flow กลายเป็น list ยาว
- Timeline มี overdue จำนวนมาก แต่ไม่ช่วย prioritize
- บนมือถือ calendar เป็นข้อมูลเยอะเกินไป

แนะนำ:

- Desktop:
  - เพิ่ม “Today / This week action list” ด้านบน
  - Kanban เพิ่ม filter “ของฉัน / overdue / due soon / campaign”
  - Timeline เพิ่ม severity grouping: overdue critical, due today, upcoming
- Mobile:
  - ให้ default เป็น agenda list ไม่ใช่ calendar grid
  - เพิ่มปุ่มเปลี่ยนสถานะงานแทนการลาก

## Sale Report

สิ่งที่ดี:

- รายงานครบมาก
- Filter ครอบคลุมทุกมิติ
- มี trend, channel, design, size/color, finance, geo/team
- ตัวเลขสำคัญอยู่ครบ

Pain:

- ข้อมูลเยอะมาก และทุก tab ยังต้องตีความเอง
- Filters + KPI + tabs + chart controls หนาแน่น
- `คนทัก & ปิดการขาย` ยังว่าง ทำให้ flow marketing-to-sales ขาด
- Clickable charts/filter ไม่มี feedback ชัดพอว่า filter ถูก apply แล้วหรือยัง

แนะนำ:

- เพิ่ม “Insights / Actions” เหนือกราฟ:
  - ลายที่ควรเติมสต็อก
  - ช่องที่โต/ตก
  - จังหวัด top opportunity
  - ลูกค้ากลุ่มต้องตาม
- ทำ active filter summary sticky:
  - “กำลังดู: เดือนนี้ · Facebook · สิริกานต์”
  - ปุ่มล้างทั้งหมดเด่น
- ถ้า tab ยังไม่มีข้อมูล เช่น funnel ให้แสดง setup checklist:
  - รัน migration
  - ไปกรอกคนทัก
  - ดูตัวอย่างข้อมูลที่ควรกรอก

## Sale > Orders

สิ่งที่ดี:

- ตารางมีข้อมูลจริง
- Filter เดือน/งาน/ช่องทางดี
- เห็นออเดอร์, ลูกค้า, จังหวัด, ลาย, ชิ้น, ยอด

Pain:

- บน desktop พอใช้ แต่ยังเป็น data table หนัก
- บนมือถือเป็นตาราง 7 คอลัมน์ อ่านยาก
- รายการ `(จับคู่ไม่ได้)` ควรกลายเป็น action ไป Data Health

แนะนำ:

- Desktop:
  - เพิ่ม filter chip `จับคู่ไม่ได้`
  - เพิ่ม CTA “ไปแก้ mapping”
- Mobile:
  - เปลี่ยนเป็น order cards:
    - order no
    - customer
    - amount
    - status/mapping
    - tap to detail

## Sale > Entry

สิ่งที่ดี:

- เป็น form ตรงงานจริง
- มี default date
- มี hotkey `Enter`
- มี section คนทักวันนี้

Pain:

- 12 controls ในหน้าเดียว โดยไม่มี step/progress
- Required fields ไม่ชัด
- ปุ่ม `กรอกคนทักวันนี้` สำคัญ แต่ตอนทดสอบเจอจังหวะ click ไม่ได้
- input ตัวเลขยังเป็น `type=number` ซึ่งบนมือถือเสี่ยง UX ไม่ดี

แนะนำ:

- แยก flow เป็น 2 mode:
  - `บันทึกออเดอร์`
  - `บันทึกคนทัก`
- ทำ sticky submit + validation:
  - “ต้องกรอก เซลล์ + ยอด + จำนวน”
- ให้คนทักวันนี้เป็น card ใหญ่ด้านบนถ้ายังไม่กรอก
- เพิ่ม quick templates:
  - โอน / COD
  - ลูกค้าใหม่ / เก่า
  - งานค้าปลีก / ส่ง

## Sale > Shirt Catalog

สิ่งที่ดี:

- มี catalog 47 รายการ
- ค้นหาและ filter หมวด/สถานะได้
- เพิ่ม/แก้ไขได้

Pain:

- หลายสินค้าเป็นราคา 0 แต่ไม่มี data quality warning
- Catalog ยังแยกจาก performance insight
- Card list ยาวมาก ถ้าไม่มีรูปจะคล้ายกันหมด

แนะนำ:

- เพิ่ม data completeness badges:
  - ราคา 0
  - ไม่มีต้นทุน
  - ไม่มีรูป
  - ไม่มี variant code
- เพิ่ม scorecard ต่อสินค้า:
  - ยอดขาย
  - ช่องที่ขายดี
  - สี/ไซซ์ขายดี
  - stock/reorder ถ้ามีข้อมูล

## Sale > CRM

สิ่งที่ดี:

- มีข้อมูลลูกค้าพร้อมใช้
- มี contact rate 51%
- มี queue count 343
- มี tier/RFM
- filter มีประโยชน์

Pain:

- ยังเป็น table-first
- “คิวตามต่อ” ไม่ใช่ workflow
- ตาราง 300 rows บนมือถือแน่นมาก
- Duplicate-looking customer rows มีโอกาสเกิด เช่นชื่อ/เบอร์ซ้ำ

แนะนำ:

- สร้าง CRM Workbench:
  - วันนี้ต้องตาม
  - ลูกค้าใหม่มีเบอร์
  - ขาประจำหายไป
  - ลูกค้าซื้อเยอะยังไม่ได้ owner
- Customer card action:
  - โทร
  - LINE/FB
  - บันทึกผล
  - นัดตามต่อ
  - assign owner
- เพิ่ม duplicate detection:
  - เบอร์เดียวกัน
  - ชื่อเดียวกัน
  - social เดียวกัน

## Sale > Import / Export

สิ่งที่ดี:

- Import modal อธิบายขั้นตอนดี
- บอกว่าต้องมี Shipnity เป็นฐานหลัก
- รองรับหลายไฟล์
- มี reconciliation ไฟล์เซลล์
- มี alias เซลล์

Pain:

- Import / Health / Alias เป็น workflow เดียวกัน แต่แยก mental model
- หลังแก้ alias/health ผู้ใช้ต้องรู้เองว่าต้อง re-import หรือ refresh report
- Alias input มีผลต่อรายงานทีมขาย แต่ข้อความ impact ยังไม่เด่นพอ

แนะนำ:

- ทำเป็น 4-step data pipeline:
  1. Upload files
  2. Validate / reconcile
  3. Fix aliases / mapping
  4. Publish report
- หลังแก้ alias ให้มี CTA:
  - “รีเฟรชรายงาน”
  - “นำเข้าใหม่เพื่อใช้ alias”

## Sale > Data Health

สิ่งที่ดี:

- ดีมากในฐานะ data quality center
- มี metric ชัด:
  - SKU ทั้งหมด
  - จับคู่ลายได้
  - มีรหัสลาย
  - ต้องตรวจ
- มี action ต่อรายการ เช่น ผูก catalog / เพิ่มสี

Pain:

- ยังดูเป็น report ไม่ใช่งานที่ต้องเคลียร์
- คำบางอย่างเช่น `คอกลม`, `คอวี` ถูกจัดในสีที่ไม่รู้จัก แปลว่าต้องแยก dimension type/color/design ให้ดีกว่าเดิม
- `จับคู่ไม่ได้เลย` มีรายการจันทกานต์เยอะ ซึ่งกระทบรายงานลายขายดีทันที

แนะนำ:

- ทำ checklist:
  - Critical: impact > 20 ชิ้น
  - Medium: 3-20 ชิ้น
  - Low: 1-2 ชิ้น
- Group by cause:
  - ลายใหม่
  - สีใหม่
  - product type ปนสี
  - SKU unknown
  - marketplace id only
- หลัง fix แสดง progress:
  - “เหลือ 18/35”
  - “คาดว่าหลังแก้จะ match 98%”

## Mobile UX Findings

ทดสอบ viewport:

```text
390 x 844
```

สิ่งที่ดี:

- ไม่มี document horizontal overflow
- bottom nav อยู่ถูกที่
- Sale sub-tabs ยังเข้าถึงได้

Pain:

- Sale Entry มี 12 controls ในหน้าจอเล็ก หนาแน่นมาก
- CRM ยังเป็น table 7 columns บนมือถือ
- Planner calendar grid บนมือถืออ่านรายละเอียดงานยาก
- ปุ่ม/แท็บเยอะมากในบางหน้า ทำให้ primary action ไม่เด่น
- input number ยังอาจเจอ iOS zoom/keyboard issues ตามเอกสาร `MOBILE-UX-RESEARCH.md`

แนะนำ:

- Mobile default views:
  - Home: action cards
  - Planner: agenda list
  - CRM: customer cards / follow-up queue
  - Orders: order cards
  - Sale Report: KPI + insights, charts secondary
- ทำ field grouping ใน Sale Entry:
  - Step 1: เซลล์ + วันที่ + ยอด/จำนวน
  - Step 2: ลูกค้า + ลาย + note

## Stability / Technical UX Notes

ระหว่างตรวจพบ console errors:

```text
RangeError: Maximum call stack size exceeded
src/dataContext.jsx:1186
@supabase/supabase-js Channel unsubscribe / trigger
```

ผลกระทบ UX ที่เป็นไปได้:

- สลับหน้าเยอะแล้ว sync/realtime เพี้ยน
- memory/subscription cleanup ไม่สมบูรณ์
- เกิด loading/sync indicator แปลก ๆ
- ผู้ใช้เจอปุ่มไม่พร้อมหรือหน้า lag โดยไม่รู้สาเหตุ

ควรตรวจ:

- Supabase realtime subscription cleanup ใน `src/dataContext.jsx`
- dependency ของ effect ที่ subscribe/unsubscribe
- repeated channel creation
- debounce/reload loop

## Priority Plan

## P0 — Clarify Core Flows + Data Quality

เป้าหมาย: ทำให้ผู้ใช้รู้ว่า “ต้องทำอะไรต่อ” และข้อมูลเชื่อถือได้

งาน:

1. เพิ่ม flow card บน Home:
   - กรอกยอดวันนี้
   - เคลียร์ Data Health
   - Follow-up ลูกค้า
   - งานค้างสำคัญ
2. Data Health เป็น checklist:
   - critical first
   - group by cause
   - progress หลังแก้
3. Orders เพิ่ม filter `จับคู่ไม่ได้` และ link ไปแก้ mapping
4. Alias เซลล์แสดง impact:
   - “มีผลต่อรายงานทีมขาย/CRM”
   - “ต้อง refresh/re-import หลังแก้”

Acceptance:

- ผู้ใช้เข้า Home แล้วเห็น 3 งานสำคัญทันที
- Data Health บอกชัดว่าเหลืออะไรต้องแก้และกระทบกี่ชิ้น/กี่ยอด
- จาก order ที่จับคู่ไม่ได้ไปแก้ mapping ได้ใน 1 click

## P1 — CRM Follow-up Workbench

เป้าหมาย: เปลี่ยน CRM จากตารางเป็นเครื่องมือปิดยอด

งาน:

1. เพิ่มหน้า/โหมด `คิวตามต่อ`
2. Customer card แทน table ใน mobile
3. เพิ่ม follow-up status:
   - ยังไม่ตาม
   - โทรแล้ว
   - ทักแล้ว
   - สนใจ
   - ปิดได้
   - ไม่สนใจ
   - นัดตามต่อ
4. เพิ่ม next follow-up date + note
5. เพิ่ม duplicate customer warning

Acceptance:

- เซลล์เปิด CRM แล้วรู้ว่า “วันนี้ต้องตามใคร”
- ทำ action ต่อ customer ได้ใน 1-2 clicks
- Owner เห็น outcome ของ follow-up

## P2 — Sale Entry / Leads Flow

เป้าหมาย: ให้การกรอกยอดและคนทักเร็วและไม่งง

งาน:

1. แยก mode `ออเดอร์` กับ `คนทัก`
2. ทำ validation/required fields ชัด
3. ทำ sticky submit บนมือถือ
4. แก้ปุ่ม `กรอกคนทักวันนี้` ให้พร้อม/มี disabled reason
5. ทำ funnel empty state เป็น setup checklist

Acceptance:

- กรอกยอดขายทั่วไปได้ภายใน 30 วินาที
- ถ้าปุ่ม disabled ต้องรู้เหตุผล
- หน้า `คนทัก & ปิดการขาย` มี path ชัดว่าต้องทำอะไรให้มีข้อมูล

## P3 — IA: Separate Sales Operation vs Sales Intelligence

เป้าหมาย: ลดความงงจากสองหน้าที่ชื่อคล้ายกันและตัวเลขไม่เท่ากัน

งาน:

1. Rename/subtitle:
   - `ยอดขาย` = Daily Sales / Target
   - `Sale` = Sales Intelligence / CRM
2. ใส่ source label ทุก KPI:
   - Daily entry
   - Import orders
3. Cross-link เฉพาะจุด:
   - จาก Sales pace ไป Sale report
   - จาก Sale report ไป daily target

Acceptance:

- ผู้ใช้ไม่ถามว่า “ทำไมยอดสองหน้าไม่เท่ากัน”
- แต่ละหน้ามี mission ชัด

## P4 — Mobile First Workflows

เป้าหมาย: ให้ทีมใช้บนมือถือได้จริง

งาน:

1. Planner mobile = agenda list default
2. CRM mobile = card queue
3. Orders mobile = order cards
4. Sale Entry mobile = grouped form / step form
5. ปุ่ม touch target >= 44px
6. input font-size >= 16px บน mobile

Acceptance:

- ไม่มีตาราง 7 คอลัมน์เป็น default บนมือถือ
- action หลักอยู่ใน first viewport
- ไม่มี iOS zoom ตอนแตะ input

## P5 — Stability & Polish

เป้าหมาย: ลด UX สะดุดที่ไม่ใช่ feature

งาน:

1. แก้ realtime subscription stack overflow
2. ลด modal/what's-new friction หลังผู้ใช้เห็นแล้ว
3. เพิ่ม loading/disabled reason ให้ปุ่มสำคัญ
4. เก็บ lint debt แยก PR

Acceptance:

- ไม่มี repeated RangeError ใน console หลังสลับหน้า
- ปุ่ม disabled สำคัญมีเหตุผล
- Build/lint baseline ดีขึ้นโดยไม่ปน feature

## Suggested Claude Starting Point

เริ่มที่ P0/P1 ไม่ใช่ refactor:

1. ทำ Data Health checklist component
2. เพิ่ม `unmatched orders` flow จาก Orders → Data Health
3. ทำ CRM follow-up workbench แบบเล็กก่อน:
   - filter `คิวตามต่อ`
   - card view
   - action note/status local/Supabase ตาม schema ที่มีหรือ migration ใหม่ถ้าจำเป็น
4. ค่อยกลับมาแก้ mobile table/card rendering

## Files likely involved

- `src/App.jsx`
- `src/views-1.jsx`
- `src/views-2.jsx`
- `src/saleDashboard.jsx`
- `src/saleCrm.jsx`
- `src/saleEntry.jsx`
- `src/saleImportHub.jsx`
- `src/saleCatalog.jsx`
- `src/index.css`
- `src/lib/saleData.js`
- `src/lib/saleRecon.js`
- `src/dataContext.jsx`

## Cautions

- อย่า revert งานเดิม มี worktree dirty อยู่ก่อน audit
- อย่าเริ่มด้วย `npm run lint --fix` ทั้งระบบ
- อย่า save alias/input ที่เห็นใน UI โดยไม่ถามผู้ใช้
- อย่าเปลี่ยน business meaning ของยอด `ยอดขาย` vs `Sale report` ก่อนยืนยัน source of truth
- ถ้าทำ CRM follow-up ต้องดู schema ก่อนว่ามี field owner/cadence/repurchase/tags พอไหม หรือควรเพิ่ม migration

