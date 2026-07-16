# REALTIME Phase C — dataContext scoped channel: การประเมิน + เหตุผลไม่ charge solo

สรุปสั้น: **ไม่แตะ dataContext live channel ในเซสชัน solo** — เป็นการตัดสินใจเชิงวิศวกรรม ไม่ใช่เลี่ยงงาน. เหตุผล + ทางที่ปลอดภัยด้านล่าง.

## สถานะจริงของ realtime (สำรวจ 2026-07-16)
`src/dataContext.jsx`:
- **1 channel** `tmk-realtime` · subscribe ~14 ตาราง `postgres_changes event:'*'`
- event มา → `refreshTables([table])` = **ดึงเฉพาะตารางที่เปลี่ยน** (ไม่ full-reload · มี per-table map)
- มี echo-skip (markSaleWrite) · polling fallback 120s ตอน WS ค้าง · teardown ปลอด recursion
→ **ไม่ใช่ "change→notify→full refetch" ที่ blueprint เขียนไว้แล้ว** — per-table refetch ทำไปตั้งแต่ PART 24/39

## ปัญหาสเกล 200 คน = อะไรจริง
ไม่ใช่ "global channel 1 อัน" (Supabase รับ subscriber เยอะได้) · แต่คือ **refetch stampede**:
- ออเดอร์ 1 ใบเปลี่ยน → 200 client ดึง `tmk_orders` (200 select ต่อ 1 write) · ยิ่ง write ถี่ยิ่งทวี
- ทางแก้ที่ตรงจุด = **payload-patch**: เอา row จาก realtime payload มา patch ใน TMK ตรงๆ (เลิก refetch) — Phase 1 ทำ notif/comment แล้ว (`reduceNotifList`/`reduceCommentList`)

## ทำไม payload-patch ที่ orders/tasks = เสี่ยงสูง (ต้อง 2 users พิสูจน์)
`refreshTables('tmk_orders')` ไม่ได้แค่ดึง row — มัน **re-run pipeline**:
1. `mapToTMK` แปลง row → shape ภายใน
2. **merge order_overrides** (resolveSkuDesigns · mergeOrderOverrides) — ค่าที่โชว์ = raw ⊕ override
3. คำนวณ computed (dashboard/leaderboard) ผ่าน setVersion
→ patch row ดิบจาก payload จะ **ข้าม step 2** = โชว์ค่า raw ทับค่าที่ user แก้ผ่าน override (ข้อมูลเพี้ยน**เงียบ** · ไม่ error) · นี่คือคลาสบั๊กที่ unit test จับยาก ต้องเห็น 2 client แก้พร้อมกันจริง

**ตาราง "ปลอดภัย patch" (ไม่มี override): channels/brands/flows/campaigns/products/settings** — แต่ churn ต่ำ (นานๆ เปลี่ยน) → payoff น้อย · ตารางที่ churn สูง (orders/tasks) = ตัวที่ patch ไม่ได้ปลอดภัย → **ประโยชน์สุทธิต่ำ ความเสี่ยงสูง**

## GOTCHA ประกอบ (memory realtime-scale-blueprint)
แก้ dataContext.jsx ซ้ำหลายรอบใน session เดียว → Vite dep re-optimize / HMR module-graph พัง (React 2 copy · "cannot add postgres_changes after subscribe") — verify กลาง session เชื่อไม่ได้ · ต้อง build+vitest+node เท่านั้น = ยิ่งยากพิสูจน์การแก้ live channel

## สิ่งที่ทำเป็น "ฐาน" ไปแล้ว (ไม่แตะ live channel)
- **channelRegistry.js** (Phase 2) = dedup + refcount subscribe (พร้อมใช้เมื่อแยก scoped)
- **reduceNotifList/reduceCommentList** (Phase 1) = แม่แบบ payload-patch (ตาราง simple)
- **rtDiag** (Phase 0) = วัด refetch/query/cacheHit จริง (`window.__rtDiag.snapshot()`) → ควรใช้วัด baseline ก่อน/หลังทุกการแก้ realtime

## ทางเดินที่แนะนำ (เมื่อพร้อมทำ session เฉพาะ + 2 users)
1. เปิด 2 tab (2 user) → `window.__rtDiag.snapshot()` วัด refetch/query baseline ตอนแก้ออเดอร์สลับกัน
2. เริ่ม payload-patch **เฉพาะตาราง simple** (channels/brands/flows) ด้วย reducer แบบ Phase 1 — วัด rtDiag ยืนยัน query ลด · TMK ตรง
3. orders/tasks: patch **ต้องผ่าน pipeline เดียวกับ refetch** (เรียก mergeOrderOverrides ต่อ row ที่ patch) — เขียน `applyOrderRowPatch(TMK, row)` ที่ reuse merge เดิม + characterization test เทียบ "patch 1 row" == "refetch ทั้งตาราง" ก่อน wire
4. scoped topic (orders:{month}) = ทำหลัง broadcast RLS (B3) — ต้องมี publish ฝั่ง server ก่อน
5. ทุกขั้น: build+vitest เขียว → deploy → 2 users เทส → rtDiag ยืนยัน → ค่อยขั้นถัดไป

## บรรทัดล่าง
ระบบ realtime ตอนนี้ **ทำงานถูกต้อง + per-table แล้ว** (ไม่ใช่ของพัง) · การรื้อ live channel แบบ solo ที่พิสูจน์ไม่ได้ = เพิ่มความเสี่ยง break realtime ให้ทุกคน โดยไม่มีหลักฐานว่าดีขึ้น · payload-patch orders ที่ทำผิด = ข้อมูลเพี้ยนเงียบ (แย่กว่า refetch ช้า) → **คุ้มค่าเมื่อทำใน session เฉพาะที่มี 2 users + rtDiag วัดจริงเท่านั้น**
