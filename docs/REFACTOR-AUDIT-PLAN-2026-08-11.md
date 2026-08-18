# แผนตรวจบั๊ก + สิ่งที่จะแก้ — Refactor รอบใหญ่ (11 ส.ค. 2569)

> **สถานะ: รอคุณตรวจ+ยืนยันก่อนแก้** — ยังไม่ได้แตะโค้ดจากแพลนนี้เลย
> ขอบเขต: การ refactor 5 เวฟ (~110 ไฟล์ uncommitted) จาก AUDIT-2026-08-11

---

## 0. สรุปผลตรวจ (ตรวจ 2 ชั้น)

**ชั้น 1 — เครื่องมืออัตโนมัติ:** `vite build` ✓ · `vitest` **415 tests** ✓ · `eslint --max-warnings=0` **0/0** ✓
**ชั้น 2 — ล่าบั๊ก 8 มิติ (เอเจนต์ find → เอเจนต์ฝ่ายค้าน verify) + ผมเช็คเองซ้ำทุกมิติ**

ผล: **บั๊กจริงที่ยืนยันแล้ว 1 ข้อ** (severity ต่ำ) · ตีตก 3 ข้อ (หักล้างได้) · พฤติกรรมเปลี่ยนโดยตั้งใจ 1 ข้อ

---

## 1. 🐛 บั๊กจริง — ยืนยันแล้ว (เสนอให้แก้)

### B1 · Service Worker cache ค้างถาวรหลัง redeploy (severity: ต่ำ · ไม่กระทบตัวเลข)
- **ไฟล์:** `public/sw.js:19` — `const VERSION = 'v1'` (hardcode)
- **อาการ:** โค้ดตั้งใจให้ "deploy ใหม่ → activate ล้าง cache เก่า" แต่ VERSION ไม่เคยเปลี่ยน → ชื่อ cache ไม่เปลี่ยน → **ไม่เคยล้าง**
  - asset ที่ Vite ใส่ hash (`/assets/*.js|css`) = รอด (URL เปลี่ยนทุก build)
  - **public asset URL คงที่** (`/fonts/*.woff2`, `/fonts/tmk-fonts.css`, โลโก้, ไอคอน) = **cache-first ค้างตลอดไป**
- **จะพังเมื่อไหร่:** วันหน้าถ้าแก้ฟอนต์ (โปรเจกต์นี้เคยแก้วรรณยุกต์ไทยหายบ่อย) หรือเปลี่ยนโลโก้ แล้ว redeploy → user เก่าที่ SW ทำงานอยู่จะได้ไฟล์เก่าตลอด จนกว่าจะ clear site data เอง (ไม่ self-heal)
- **เสนอแก้ (เลือก 1):**
  - **(ก) แนะนำ:** inject VERSION ตอน build (เช่น `vite define` = build timestamp/hash) → ชื่อ cache เปลี่ยนทุก deploy → โค้ดล้าง cache ที่มีอยู่แล้วทำงานจริง · **แก้จุดเดียว ~3 บรรทัด · ปลอดภัยสุด**
  - (ข) เปลี่ยน public asset ที่ URL คงที่เป็น network-first/stale-while-revalidate (self-heal แต่ช้าลงเล็กน้อยตอน offline)
- **ผลถ้าไม่แก้:** ตอนนี้ยังไม่กระทบ (เพิ่ง deploy ครั้งแรก) · แต่จะเป็นระเบิดเวลาตอน deploy เปลี่ยนฟอนต์/โลโก้ครั้งถัดไป

---

## 2. ⚠️ พฤติกรรมเปลี่ยนจริง (ตั้งใจ — ขอคำยืนยัน)

### C1 · Confetti หน้าฉลองทะลุเป้า — จากสุ่มทุก render → สุ่มครั้งเดียว
- **ไฟล์:** `src/components.jsx` (CelebrationOverlay · แก้ตอน lint 131→0)
- **เดิม:** สุ่มตำแหน่ง/สีเศษกระดาษใหม่ทุก render (ทุก tick ของ count-up) → เศษกระดาษ**กระตุก/รีสตาร์ต animation**
- **ตอนนี้:** `useState(makeConfetti)` สุ่มครั้งเดียวตอนเปิด → นิ่ง ลื่น
- **นี่เป็นการแก้บั๊กเชิงภาพ** (ของเดิมกระตุกคือไม่ตั้งใจ) แต่ถ้าคุณชอบเอฟเฟกต์เดิม → บอกได้ ผมย้อนเฉพาะจุดนี้
- **ไม่กระทบข้อมูล/ตัวเลขใดๆ**

---

## 3. ℹ️ Operational note (ไม่ใช่บั๊กโค้ด — เป็นเรื่อง deploy/นโยบาย)

| # | เรื่อง | ต้องทำอะไร |
|---|---|---|
| O1 | ~~ช่วงว่าง snapshot คลัง~~ | **ยกเลิกแล้ว (15 ส.ค. 69)** — user ไม่เอา inventory-snapshot · ลบ edge fn + migration ทิ้ง (หน้าคลังถูกลบตั้งแต่ PART 35 ไม่มีใครใช้) |
| O2 | **RLS §4 (จำกัดการอ่านออเดอร์ต่อเซลล์)** ผมคอมเมนต์ปิดไว้ | เปิดก็ต่อเมื่ออยากให้ non-admin เห็น "รายงานขาย" เป็นยอดตัวเอง (ไม่ใช่ยอดทีม) = การตัดสินใจธุรกิจ |

---

## 4. ✅ ที่ตรวจแล้ว "ไม่ใช่บั๊ก" (ตีตกโดยเอเจนต์ฝ่ายค้าน — บันทึกไว้ให้รู้ว่าเช็คแล้ว)

- **RLS delete=admin ทุบ flow ที่ editor ลบของ?** → ไม่จริง · แอปใช้ soft-delete (UPDATE deleted_at) + RPC (SECURITY DEFINER) ไม่ได้ DELETE ตรงผ่าน REST · editor ยังลบผ่าน UI ได้เหมือนเดิม
- **owner-read ใบเสร็จทำ checkDuplicates ตาบอด?** → ไม่จริง · checkDuplicates อ่านจาก tmk_mp_orders (ไม่ถูก §3 จำกัด) กันเลขซ้ำได้ปกติ
- **userEmail ย้าย render→effect ทำโครงการ private หายตอนเปิดแอป?** → ไม่จริง · ลำดับ dataflow จริงไม่ได้ lag ในสถานการณ์ที่อ้าง
- **memo string-key (effKey/fKey/rangeKey) ค้าง?** → ไม่จริง · ใช้ `JSON.stringify(ทั้ง object)` → field เปลี่ยนแต่ key ไม่เปลี่ยน = เป็นไปไม่ได้
- **แยกไฟล์แล้ว prop/export ตกหล่น?** → ครบ · ctx 5/5 · PlannerView/FlowsView/PublicFlowShare export+lazy-import ถูก · settings re-export DutiesView/BrandsView · side-effect localStorage คงจังหวะเดิม
- **RLS คอลัมน์ไม่มีจริง?** → มีครบ (uploader_email/salesperson ใน receipts · salesperson ใน funnel · email ใน staff)

---

## 5. 📋 สิ่งที่ต้อง "คุณ" ลงมือ (ไม่ใช่โค้ด)

1. **Commit** ~110 ไฟล์ (ยังไม่มี baseline) — ผมเตรียม message ให้เมื่อสั่ง · จะกัน `.claude/launch.json` + `daily-sale-report/index.ts` ออก
2. **Deploy edge (ผ่าน Dashboard):** `daily-sale-report` (ใช้ `_shared` แล้ว) · `line-broadcast` (fail-closed) · ~~`inventory-snapshot`~~ (ยกเลิก — ลบทิ้งแล้ว)
3. **รัน migration ใน SQL Editor:**
   - `20260811-rls-tier3b-owner-scope.sql` (ลบ=admin + owner-read)
   - `20260811-migrations-tracking.sql` (ตารางจด migration)
   - ~~`20260811-inventory-snapshot-cron.sql`~~ (ยกเลิก — ลบไฟล์ทิ้งแล้ว ไม่ต้องรัน)

---

## 6. 🎯 สรุปสิ่งที่ผมจะแก้ (ถ้าคุณอนุมัติ)

| รายการ | จะทำ | รอคุณตัดสิน |
|---|---|---|
| **B1 · SW version** | inject build-time VERSION เข้า sw.js (วิธี ก) + verify build | เลือกวิธี ก หรือ ข? |
| **C1 · Confetti** | — (คงไว้แบบนิ่ง) | อยากให้ย้อนเป็นแบบเดิมไหม? |

> **นอกจาก B1 ผมไม่พบอะไรที่ต้องแก้** — โค้ด refactor ทั้ง 5 เวฟผ่านการตรวจ 2 ชั้นแล้วสะอาด

---

**คำถามให้คุณตอบก่อนผมลงมือ:**
1. B1 (SW) → แก้เลยไหม? เอาวิธี **ก** (แนะนำ) หรือ **ข**?
2. C1 (confetti) → คงแบบนิ่ง หรือย้อนแบบกระตุกเดิม?
3. หลังแก้ B1 เสร็จ → ให้ผม **commit ทั้งชุด** เลยไหม?
