# TMK Operation

แดชบอร์ดบริหารงานแบรนด์แฟชั่น (Thai fashion-brand operations dashboard) — ติดตามยอดขาย, วางแผนคอนเทนต์, จัดการสต็อก/แคมเปญ/ทีม โดย **ข้อมูลทุกอย่างดึงจาก Supabase แบบเรียลไทม์** ไม่มี mock data

> ทุกหน้าที่มีตัวเลือกเดือนจะแสดงข้อมูล **แยกตามเดือนที่เลือก** (อดีต / ปัจจุบัน / อนาคต) — "วันนี้" ใช้วันที่จริงของเครื่อง · ปีเป็น พ.ศ. (BE = ค.ศ. + 543)

---

## ✨ ฟีเจอร์หลัก

| โมดูล | รายละเอียด |
|---|---|
| **หน้าหลัก** (Home) | ภาพรวมเรียลไทม์ของเดือนปัจจุบัน: ยอด MTD, pace, KPI, แจ้งเตือน |
| **ยอดขาย** (Sales) | ภาพรวม / ช่องทาง / โฆษณา & แชท / ลูกค้า — แยกตามเดือน + เทียบ MoM, YoY |
| **บันทึก** (Entry) | บันทึกยอดรายวันต่อช่องทาง (รายได้/ออร์เดอร์/ลูกค้าใหม่-เก่า/แชท) · ตั้งค่ารายเดือน (เป้า/งบ/กลุ่มลูกค้า/แคมเปญแอด) · สถานะการกรอก · กรอกข้อมูลย้อนหลัง |
| **วางแผน** (Planner) | ปฏิทินคอนเทนต์ (ไอคอนช่องทางต่อวัน) · Kanban บอร์ดคุมงาน · ไทม์ไลน์แคมเปญ |
| **แคตตาล็อก** (Catalog) | สินค้า + สต็อก/จุดสั่งซื้อ · แคมเปญการตลาด · ใบสั่งซื้อ (PO) · สัดส่วนสี/ไซซ์ |
| **ตั้งค่า** (Settings) | ช่องทางการขาย · หน้าที่ (duties) · ผู้ใช้/สิทธิ์ · ประวัติการใช้งาน (audit) · ถังขยะ (กู้คืน/ลบถาวร) · Export CSV |
| **ระบบ** | Soft-delete + ถังขยะ · Audit log · แจ้งเตือน (วันนี้/ตามวันที่/เดือนที่แล้ว) · ค้นหา ⌘K · ธีมมืด/สว่าง |

---

## 🧱 Tech Stack

- **React 19** + **Vite 8** (JSX, ESM)
- **Supabase** (`@supabase/supabase-js`) — Postgres + Realtime (postgres_changes)
- **recharts** — กราฟ · **lucide-react** — ไอคอนบางส่วน (ไอคอนหลักเป็น inline SVG ใน `components.jsx`)
- ไม่มี TypeScript / ไม่มี state library ภายนอก (ใช้ React context + singleton)

---

## 🚀 เริ่มใช้งาน

### 1) ติดตั้ง
```bash
npm install
```

### 2) ตั้งค่า environment
สร้างไฟล์ `.env` (ดูตัวอย่างจาก `.env.example`):
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

### 3) ตั้งค่าฐานข้อมูล Supabase
รันใน **Supabase SQL Editor**:

- **โปรเจกต์ใหม่ (สร้างครั้งแรก):** รัน `supabase/SETUP-ALL.sql` (สร้างตาราง + คอลัมน์ + RLS + ค่าตั้งต้น ครบในไฟล์เดียว — ไม่มีข้อมูลปลอม)
- **โปรเจกต์เดิม (อัปเดต schema เพิ่ม):** รันเฉพาะ migration ที่ยังไม่ได้รันใน `supabase/migrations/`
  - `20260608-daily-channel-detail.sql` — เก็บ orders/ลูกค้า/แชท ต่อช่องทางรายวัน (`channels` jsonb)
  - `20260608-daily-reply-time.sql` — เก็บเวลาตอบแชทเฉลี่ย/วัน (`avg_reply_minutes`)

### 4) รัน
```bash
npm run dev      # dev server (Vite, default :5173)
npm run build    # build production → dist/
npm run preview  # preview build
npm run lint     # ESLint
```

---

## 📁 โครงสร้างโปรเจกต์

```
src/
├─ main.jsx           # entry — mount <App/>
├─ App.jsx            # โครง layout, นำทาง, แจ้งเตือน, ค้นหา ⌘K, modal host
├─ data.js            # ⭐ TMK singleton (shape เปล่า — เติมจาก Supabase ตอน runtime)
├─ dataContext.jsx    # ⭐ โหลด Supabase → mapToTMK → mutateTMK + Realtime + computeMonth()
├─ userContext.jsx    # auth/session (localStorage) + getCurrentUser()
├─ i18n.jsx           # ภาษา (TH/EN)
├─ components.jsx     # UI ย่อย: Icon, Avatar, Ring, MiniArea, formatters B/Bk/P/N
├─ modals.jsx         # ฟอร์มทั้งหมด: RecordSales, MonthlyTarget, Task, Product, Campaign,
│                     #   PO, AdCampaign, CustomerSegment, Historical, Login
├─ views-1.jsx        # HomeView, SalesView (overview/channels/ads/customers)
├─ views-2.jsx        # PlannerView (calendar/kanban/timeline), CatalogView, SettingsView,
│                     #   ProfileView, TrashView, CSV export, channel→icon mapping
├─ views-entry.jsx    # EntryView: DailyEntry, MonthlySetup, StatusOverview, QuarterView
├─ onboarding.jsx     # หน้าเริ่มต้นใช้งาน
├─ toast.jsx          # toast notification
├─ assets/            # tmk-logo.png (โลโก้ + favicon)
└─ lib/
   ├─ supabaseClient.js  # สร้าง client จาก env
   ├─ dateUtils.js       # getToday() (วันจริง), thaiDate(), แปลง พ.ศ.
   └─ audit.js           # logAudit() เขียน tmk_audit_logs

supabase/
├─ SETUP-ALL.sql       # ⭐ master schema + config (รันครั้งเดียวสำหรับ DB ใหม่)
└─ migrations/         # delta migration สำหรับ DB ที่มีอยู่แล้ว

public/tmk-logo.png    # โลโก้ (favicon อ้างใน index.html)
```

---

## 🏗️ สถาปัตยกรรมข้อมูล (สำคัญ)

### Singleton `TMK` + mutate-in-place
- `data.js` export `TMK` เป็น object ว่าง (แค่ shape) — views ทุกตัว `import { TMK }` ตรงๆ
- `dataContext.jsx` โหลดทุกตารางพร้อมกัน (`loadAllTables`) → แปลงด้วย `mapToTMK` → เขียนทับ `TMK` แบบ **in-place** (`mutateTMK`) แล้ว bump `version` ให้ re-render
- **Realtime:** subscribe `postgres_changes` ทุกตาราง → มีการเปลี่ยนแปลง → reload (debounce 300ms) อัตโนมัติ ไม่ต้องรีเฟรช

### Engine รายเดือน — `computeMonth(monthIdx0, yearBE)`
หัวใจของ "ข้อมูลแยกตามเดือน" — รับเดือน/ปีที่เลือก แล้วคำนวณจาก `TMK.dailyAll` (ทุกวันทุกเดือน) + `TMK.monthly` + `TMK.channels` คืน `{ consts, channels, dailyMonth, dailyLog, fb, computed, isCurrent, isFuture, ... }` ทุก view ที่มีตัวเลือกเดือนใช้ค่านี้ (ไม่อ่านค่า aggregate รวมของเดือนปัจจุบันจาก `TMK.computed` โดยตรง)

### Soft-delete · Audit · Trash
- ลบ = `update({ deleted_at })` (ไม่ลบจริง) · ทุก query อ่านกรอง `.is('deleted_at', null)`
- **ถังขยะ** (`TrashView`) กู้คืน (`deleted_at = null`) หรือลบถาวร (`.delete()`)
- ทุก action สำคัญเขียน **audit log** ผ่าน `logAudit()` (fire-and-forget)

### วันที่จริง
`getToday()` คืนวันที่จริงของเครื่อง (ไม่ฮาร์ดโค้ด) — เดือนปัจจุบัน/อนาคต/อดีต ตัดสินจากค่านี้

---

## 🗄️ ตารางใน Supabase (17)

`tmk_channels` · `tmk_campaigns` · `tmk_tasks` · `tmk_products` · `tmk_settings` ·
`tmk_user_roles` · `tmk_staff` · `tmk_duties` · `tmk_daily_sales` · `tmk_ad_campaigns` ·
`tmk_customer_segments` · `tmk_fb_metrics` · `tmk_monthly_history` · `tmk_color_mix` ·
`tmk_size_mix` · `tmk_purchase_orders` · `tmk_audit_logs`

> โครงสร้างเต็ม + RLS อยู่ใน `supabase/SETUP-ALL.sql` — ใช้ **anon/publishable key** ฝั่ง client เท่านั้น (ห้ามใส่ service key ในเว็บ)

---

## 📝 หมายเหตุ

- ใช้ key สาธารณะ (anon) → ไม่สามารถรัน DDL/ALTER จากเว็บได้ ต้องรัน SQL ใน Supabase SQL Editor เอง
- ช่องทางของงาน (task) ใช้ได้เฉพาะช่องทางจริงใน `tmk_channels` — งานที่ไม่ผูกช่องทางจะแสดงว่า **"ไม่มี"** (ไม่มีไอคอนหลอก)
- ตัวเลขที่ไม่มีข้อมูลจะแสดง **"—"** (ไม่มี NaN)
