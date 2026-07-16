# REALTIME Phase C2 — แผน refactor core (ต้อง 2-users + rtDiag พิสูจน์ · session เฉพาะ)

สถานะ: **แผน** — ยังไม่ลงมือ (เสี่ยงสูงถ้าทำ solo · ต้องพิสูจน์ด้วยคนจริง). ทำเสร็จ solo แล้ว = §0-3.7 primitives + payload-patch notif/comment + OCC + idempotency + featureFlags. ที่เหลือด้านล่างต้องแตะ core เปราะ (dataContext/mapToTMK) หรือ infra.

## ROOT constraint (ทำไมต้อง careful)
`mapToTMK.js` = **holistic derived transform**: `campaigns[].tasks` นับ `raw.tasks` · channels financial derive จาก `raw.daily` · monthly overwrite ด้วย dailyAgg · channels/brands/flows **sort ร่วม** · roles enrich จาก duties. ⇒ patch ตารางเดี่ยวใน TMK ตรงๆ = count/sort/derived เพี้ยนเงียบ. Blueprint §11 สมมติมี **entity store (byId/versions)** ก่อน — TMK ยังไม่มี.

## ลำดับ (ทำทีละขั้น · build+vitest เขียว → deploy → 2 users เทส → rtDiag ยืนยัน → ขั้นถัดไป)

### C2.1 — Entity store เข้า dataContext (§24.1) [ใหญ่สุด · core]
- ใช้ `src/realtime/entityStore.js` (มีแล้ว·tested) เป็น byId/versions ต่อ entity (orders/tasks/customers)
- dataContext callback: แทน `refreshTables()` → `applyDomainEvent()` patch (gate ด้วย flag `realtime_v2_patch_only`)
- **orders/tasks ต้อง patch ผ่าน pipeline เดียวกับ refetch**: เขียน `applyOrderRowPatch(TMK,row)` / `applyTaskRowPatch` ที่ reuse `mergeOrderOverrides`/mapToTMK ต่อ row + **characterization test เทียบ "patch 1 row" == "refetch ทั้งตาราง"** ก่อน wire
- ตาราง simple (channels/brands/flows/campaigns) patch + re-sort ตาม sortOrder (กัน order เพี้ยน)
- expose selector hooks `useTMKEntity/useTMKList` → ลด global setVersion rerender

### C2.2 — Scoped subscription (§24.1-24.4) [core]
- แตก global 20-table channel → scoped topic ด้วย `topicBuilder.js` (มีแล้ว) + `channelRegistry.js` (มีแล้ว·wired sale)
- แตก reloadKey chains (views-orders `reloadAll` / saleDashboard `useSaleLiveReload` / salePerf `load(true)`) → patch เฉพาะ entity/list/aggregate
- **toolkit ที่ต้องสร้างเพิ่มตอนนี้** (§20 · pure·tested): `eventSchema.js` (validate domain event §5.2) · `eventRouter.js` (route event→handler ตาม topic/type) · ต่อจาก topicBuilder/eventDedup/entityStore

### C2.3 — Domain events server-side (§7/§8 · migration พี่รัน) [infra]
- migration: outbox `tmk_domain_events` (§7.1) + trigger `tmk_broadcast_order_event` (§8 · sanitized payload · ตรวจ signature Supabase ก่อน) + `realtime.messages` RLS (§19 · private channel)
- FE: subscribe broadcast topic แทน postgres_changes (gate `realtime_v2_orders`)

### C2.4 — CRM server aggregation (§17/§24.5 · migration) [infra]
- migration `tmk_customer_crm_summary` + trigger/reconciliation · saleCrm อ่านจาก summary แทน `cachedFetchAll('tmk_mp_orders')` ทั้งก้อน (gate `realtime_v2_crm`)

### C2.5 — Presence (§18 · ต้อง 2 users) [2-users]
- สร้าง `src/realtime/presenceManager.js` (Supabase Presence wrapper · track section throttle 3-5s) + wire behind `presence_v2`
- ลบ DB heartbeat: `App.jsx` upsert 45s (§24.8) + `views-1.jsx` select 30s (§24.9)

## 🔴 พี่ต้องทำ (ท้ายสุด)
1. รัน migration C2.3/C2.4 (ผมร่าง SQL+verify ให้)
2. เปิด Supabase **Realtime Authorization + private channels** (§19)
3. จัด **2 users** เทส: conflict(§27.4D) · presence · scoped event delivery
4. **Load test** 200 conn / 50 writes/นาที (§27 · k6/artillery + Realtime Reports)
5. คุม rollout ด้วย featureFlags (§26: admin 5 → 5% → 20% → 50% → 100%) — flag พร้อมแล้ว (`src/realtime/featureFlags.js`)

## เครื่องมือพร้อมแล้ว (solo · tested · unwired)
`rtDiag`(วัด baseline·`window.__rtDiag.snapshot()`) · `channelRegistry` · `topicBuilder` · `eventDedup` · `entityStore` · `featureFlags` · `optimisticUpdate`(OCC+merge) · payload-patch reducers(notif/comment)
