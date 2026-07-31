# daily-sale-report — สรุปยอดขายรายวันเข้า LINE (เที่ยง + เย็น)

ยิงสรุปยอดของ "วันนี้" เข้ากลุ่ม LINE ทีมอัตโนมัติ วันละ 3 รอบ (12:00 / 17:00 / 22:00 น.)
ตัวเลข + ลำดับ ตรงกับ **ฟอร์แมตรายงานปกติ** (โอน/COD/ยอดรวม/ออเดอร์/ตัว · คนทัก/%ปิด/Basket size/AVG ตัว/DFT)

ตัวอย่างข้อความที่เข้า LINE:
```
🕛 สรุปยอดเที่ยง · 29/7/2569
━━━━━━━━━━━━
💰 ยอดขายรวม  ฿867
   ├ โอน  ฿558
   └ COD  ฿309
📦 จำนวนออเดอร์  3
👕 จำนวนตัว  3
━━━━━━━━━━━━
💬 รวมคนทัก  33 · ปิด 9.09%
🧺 Basket size  ฿289
📐 AVG  1 ตัว/ออเดอร์
🧵 DFT  0 ออเดอร์ · 0 ตัว
```

```
pg_cron (เที่ยง/เย็น) ──net.http_post──▶ daily-sale-report (Deno)
                                            │  อ่าน tmk_mp_orders + overrides + funnel (service role)
                                            │  รวม KPI ของวันนี้ (เวลาไทย)
                                            ▼
                                     LINE push ▶ กลุ่มทีม (LINE_TARGET_ID)
```

---

## สิ่งที่มีอยู่แล้ว (ไม่ต้องทำซ้ำ)
- LINE OA + `LINE_CHANNEL_ACCESS_TOKEN` — ตั้งไว้แล้วจากฟีเจอร์ `line-broadcast`
- Edge Function เขียนเสร็จแล้ว 2 ตัว: `daily-sale-report` (ตัวหลัก) + `line-whoami` (ช่วยดึง groupId)
- migration ตั้ง cron: `supabase/migrations/20260803-daily-report-cron.sql`

## สิ่งที่คุณต้องทำเอง — ทำผ่านเว็บทั้งหมด (ไม่ต้องลง CLI)

> ค่าประจำโปรเจกต์นี้:
> - **project ref** = `asimudifasqvtjegbvdp`
> - **base URL ฟังก์ชัน** = `https://asimudifasqvtjegbvdp.supabase.co/functions/v1/<ชื่อฟังก์ชัน>`
> - เปิด Supabase Dashboard: https://supabase.com/dashboard/project/asimudifasqvtjegbvdp

### ① สร้าง 2 ฟังก์ชันบน Dashboard (ก๊อปโค้ดวาง)
Supabase → เมนูซ้าย **Edge Functions** → **Deploy a new function** → **Via Editor**
1. `daily-sale-report` — ก๊อปทั้งไฟล์ `supabase/functions/daily-sale-report/index.ts` วาง → **Deploy**
2. `line-whoami` — ก๊อปทั้งไฟล์ `supabase/functions/line-whoami/index.ts` วาง → **Deploy**

> ตั้งแต่ปลายปี 2024 Dashboard deploy จะ **ปิด verify-JWT ให้เองได้** — ถ้ามีสวิตช์ "Verify JWT" ตอนสร้าง ให้ **ปิด** (เพราะ cron ไม่มี session เรากันด้วย CRON_SECRET แทน)

### ② ตั้ง secrets (Environment variables)
Edge Functions → แท็บ **Secrets** (หรือ **Manage secrets**) → **Add new secret** ทีละตัว:

| ชื่อ (key) | ค่า (value) |
|---|---|
| `CRON_SECRET` | สุ่มสตริงยาวๆ เดายาก เช่น `tmk-7h2k9x...` (จำไว้ใช้ขั้น ⑤) |
| `LINE_TARGET_ID` | groupId/userId ปลายทาง (ได้จากขั้น ④) |

> `LINE_CHANNEL_ACCESS_TOKEN` มีอยู่แล้วจาก line-broadcast — เช็คว่ามีในรายการ ถ้าไม่มีให้เพิ่มด้วย token จาก LINE Developers

### ③ (ทางเลือก) ปิด verify JWT ถ้ายังไม่ได้ปิดตอนสร้าง
ถ้าตอน curl ทดสอบแล้วเจอ error `401 Invalid JWT` แปลว่ายัง verify JWT อยู่ →
Edge Functions → เลือกฟังก์ชัน → **Details/Settings** → ปิด **Enforce JWT verification** ทั้ง `daily-sale-report` และ `line-whoami`

### ④ ดึง groupId ของกลุ่มทีม (ทำครั้งเดียว)
LINE ไม่มีหน้าให้ก๊อป groupId ตรงๆ — ต้องอ่านจาก webhook (เลยมี `line-whoami` ช่วย):
1. ไป **LINE Developers Console** → เลือก channel → แท็บ **Messaging API**
2. ช่อง **Webhook URL** วาง `https://asimudifasqvtjegbvdp.supabase.co/functions/v1/line-whoami` → **Verify** (ควรขึ้น Success) → เปิด **Use webhook**
3. เลื่อนลงปิด **Auto-reply messages** + **Greeting messages** (กันบอทตอบมั่ว)
4. เชิญ **LINE OA (บอท)** เข้ากลุ่มทีม → พิมพ์อะไรก็ได้ในกลุ่ม เช่น `id`
5. บอทตอบ `groupId: Cxxxxxxxx...` กลับมา → **ก๊อปไปใส่ `LINE_TARGET_ID` ในขั้น ②**
6. เสร็จแล้วปิด Use webhook / ลบ Webhook URL ได้ (ไม่ต้องใช้ `line-whoami` อีก)

> อยากส่งเข้าแชตส่วนตัวแทนกลุ่ม? ใช้ **Your user ID** ในแท็บ Messaging API เป็น `LINE_TARGET_ID` (ข้ามขั้น webhook)

### ⑤ ทดสอบก่อนตั้งเวลา
เปิดเว็บ https://reqbin.com หรือใช้ Terminal ยิง (แทน `<CRON_SECRET>` ด้วยค่าจริง):

**dry run** (ไม่ส่งจริง — คืน preview + JSON การ์ด):
```bash
curl -X POST "https://asimudifasqvtjegbvdp.supabase.co/functions/v1/daily-sale-report?dry=1&key=<CRON_SECRET>"
```
**ยิงจริงเข้า LINE:**
```bash
curl -X POST "https://asimudifasqvtjegbvdp.supabase.co/functions/v1/daily-sale-report?slot=noon&key=<CRON_SECRET>"
```

### ⑥ ตั้งเวลา (cron)
Supabase → **SQL Editor** → **New query** → ก๊อปทั้งไฟล์ `supabase/migrations/20260803-daily-report-cron.sql`
ก่อนกด Run แก้ 2 จุด (Ctrl/Cmd+F แทนที่):
- `__PROJECT_REF__` → `asimudifasqvtjegbvdp`
- `__CRON_SECRET__` → ค่าเดียวกับขั้น ②

กด **Run** แล้วเช็ค: รัน `select jobname, schedule from cron.job;` ควรเห็น 2 แถว (noon/evening)

---

## รายละเอียดที่ควรรู้
- **เวลา:** cron เป็น UTC (ไทย−7) → 12:00=`0 5` · 17:00=`0 10` · 22:00=`0 15` แก้ได้ในไฟล์ migration
- **"วันนี้" = เวลาไทย:** ฟังก์ชันบวก +7 ชม.เอง (ดู `bkkToday()`)
- **push เท่านั้น ไม่ broadcast:** กันยอดขายภายในรั่วไปถึงลูกค้าที่ฟอลโล OA
- **ตรงกับแดชบอร์ด:** merge `tmk_order_overrides` ด้วย (ยอด/ช่องทางชำระที่แก้มือจะสะท้อนตรงกัน)
- **พารามิเตอร์ query:** `?slot=noon|evening` (แค่หัวข้อความ) · `?date=YYYY-MM-DD` (ย้อนหลัง/ทดสอบ) · `?dry=1` (ไม่ส่งจริง) · `?key=<CRON_SECRET>` (auth ตอนเทสด้วย curl)

## รูปแบบข้อความ
- **การ์ด Flex (ค่าเริ่มต้น):** สีตามแดชบอร์ด (รวม=ม่วง · โอน=เขียว · COD=ส้ม) — ดู `buildFlex()`
- **อยากได้ข้อความล้วนแทน:** ตั้ง secret `REPORT_FORMAT=text` หรือเทสด้วย `?format=text`

## ต่อยอดได้ทีหลัง
- **แยกรายเซลล์:** เพิ่ม top-3 เซลล์วันนี้ในการ์ด (มี `salesperson` ใน query อยู่แล้ว)
- **ปุ่มเปิดเว็บ:** เพิ่ม footer ปุ่ม "ดูรายละเอียด" ลิงก์ไป dashboard ใน Flex bubble
- **เตือนเฉพาะวันมียอด:** ถ้าอยากข้ามวันที่ยอด 0 ให้ return ก่อน push เมื่อ `nOrders===0`
