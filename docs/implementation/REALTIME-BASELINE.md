# REALTIME-BASELINE — Phase 0 Instrumentation

> อ้างอิง: `TMK-REALTIME-SCALE-200-USERS-BLUEPRINT.md` (sha256 verified) · Phase 0 = instrument เท่านั้น **ไม่เปลี่ยน behavior**
> วันที่: 2026-07-16 · สถานะ: instrumentation ลงแล้ว (dev-only) · behavior คงเดิม (build/173 tests/no-undef 0 ผ่าน)

---

## 1. สถาปัตยกรรม realtime ปัจจุบัน (survey จริงจากโค้ด)

### 1.1 Global channel — `src/dataContext.jsx`
- **1 channel `tmk-realtime`** subscribe **21 ตาราง** ผ่าน `postgres_changes { event:'*' }`
  ```
  tmk_channels, tmk_campaigns, tmk_tasks, tmk_brands, tmk_flows, tmk_products, tmk_settings,
  tmk_user_roles, tmk_staff, tmk_duties, tmk_daily_sales, tmk_ad_campaigns,
  tmk_customer_segments, tmk_fb_metrics, tmk_monthly_history, tmk_color_mix, tmk_size_mix,
  tmk_orders, tmk_customers, tmk_task_comments
  ```
- callback **ไม่ใช้ payload** → รวมเป็น `pendingTables` → debounce 300ms → `refreshTables(ts)` = **refetch ต่อตาราง** (ไม่ patch row)
- **POLL fallback**: 10 ตาราง (`POLL_TABLES`) refetch ทุก **120 วินาที** เมื่อ WS ล่ม/visible
- ทุก refresh → `mapToTMK` → `mutateTMK` → **`setVersion` global** → rerender consumers ทั้งหมด
- ข้อดีที่มีแล้ว: debounce · in-flight guard · own-write echo-skip (800ms) · backoff reconnect (3 ครั้ง) · visibility gate · teardown-safe

### 1.2 Sale channel — `src/lib/saleRealtime.js`
- `sale-live-<random>` subscribe `tmk_sale_receipts` + `tmk_sales_funnel` → callback `fireFor` → **`load(true)` full reload** ของหน้านั้น (dashboard/perf/orders ดึง dataset หลายชุด)

### 1.3 Scoped channels (filter ถูกทาง แต่ callback = reload)
| ไฟล์ | channel | filter | callback | ปัญหา |
|---|---|---|---|---|
| `lib/notifStore.js` | `notif:<email>` | `user_email` ✅ | `loadList(email)` | reload ทั้ง list ทุก event |
| `modals-task.jsx` | `cmts-<taskId>` | `task_id` ✅ | `loadComments()` | reload ทั้ง thread ทุก event |
| `views-log.jsx` | `audit-live-*` | — (INSERT) | **patch จาก `payload.new`** ✅ | **ตัวอย่างที่ถูกต้องแล้ว** (append row เดียว) |

### 1.4 Reload-key chains + browser aggregation
- `reloadKey`: `saleDashboard.jsx` · `views-orders.jsx` · `saleImportHub.jsx` — 1 event → reload หลาย dataset
- `cachedFetchAll` (โหลดทั้งตารางมา aggregate ใน browser): saleDashboard ×5 · saleCatalog ×4 · saleCrm ×4 · salePerf ×2 · views-orders ×1 · saleImportHub ×2

### 1.5 Presence (ใช้ DB เป็น heartbeat — ตรงข้ามกับ blueprint §18)
- `App.jsx`: `upsert tmk_presence` ทุก **45 วินาที** · `views-1.jsx`: `SELECT tmk_presence` ทุก **30 วินาที**

---

## 2. Instrumentation ที่เพิ่ม (Phase 0 · dev-only · no-op ใน prod)

`src/realtime/diagnostics.js` — singleton `rtDiag` (enabled เฉพาะ `import.meta.env.DEV`; prod = ทุก method early-return, zero overhead)

| metric | จุดวัด | อ่านจาก |
|---|---|---|
| `activeChannels` / `channels` | channelOpen/Close ทุก subscribe/teardown (dataContext/saleRealtime/notif/comments/audit) | `snapshot()` |
| `eventsByTable` | ทุก `postgres_changes` callback (รวม echo) | |
| `refetchByTable` (count+rows) | `dataContext.refreshTables` per-table | |
| `queryByTable` (count+rows+cacheHits) | `lib/saleData.cachedFetchAll` | |
| `reconnects` | dataContext reconnect | |
| `rendersByScreen` | `useRenderCount` ใน saleDashboard/orders/salePerf | |

**วิธีอ่าน baseline (dev):** เปิดแอป → ใช้งานสักพัก → console:
```js
window.__rtDiag.snapshot()   // ดูตัวเลขสะสม
window.__rtDiag.reset()      // ล้างเริ่มนับใหม่ (เช่น ก่อนทดสอบ 1 scenario)
```

ทดสอบแล้ว (test 8 เคส): counter/bounded(maxKeys)/no-op-when-disabled ถูกต้อง · ไม่กระทบ behavior

---

## 3. ปัญหาเชิง scale (baseline gap เทียบเป้า blueprint)

| # | ปัญหา | ผลที่ 200 users / 50 writes/min |
|---|---|---|
| G1 | 1 event → **refetch ทั้งตาราง** (ไม่ patch row) | 1 write → N refetch × rows จำนวนมาก |
| G2 | **subscribe ตามชื่อตาราง ไม่ใช่ scope** (21 ตาราง global ให้ทุก client) | ทุกคนรับ event ที่ไม่เกี่ยวข้อง |
| G3 | **global `setVersion`** → rerender consumer ทั้งระบบ | task update rerender dashboard |
| G4 | **reloadKey chain** 1 event reload หลาย dataset (dashboard/orders) | funnel event → reload orders+skus |
| G5 | `cachedFetchAll` → **aggregate orders ทั้งระบบใน browser** (CRM/perf) | คอขวดเมื่อ orders หลักแสน+ |
| G6 | notif/comments callback = **reload ทั้ง list/thread** | ควร patch INSERT/UPDATE/DELETE |
| G7 | **presence = DB heartbeat** (upsert 45วิ + select 30วิ) | write/read DB ไม่จำเป็น × ผู้ใช้ |
| G8 | ไม่มี **row_version / idempotency / domain event / outbox** | conflict เขียนทับเงียบ · retry ซ้ำ |

**สิ่งที่ดีอยู่แล้ว (คงไว้):** debounce · echo-skip · per-table refresh (ดีกว่า full load เดิม) · backoff reconnect · views-log payload-patch (แม่แบบ Phase 1)

---

## 4. เสนอ Phase 1 (Low-risk Payload Patch — ตาม blueprint §25/§32)

**ทำก่อน (เสี่ยงต่ำ · ไม่แตะ Orders/Sales/CRM):**
1. **Notifications** (`notifStore.js`) — callback ใช้ `payload` patch: INSERT→prepend · UPDATE→patch by id · DELETE→remove · unread count delta · reconnect scoped sync
2. **Task Comments** (`modals-task.jsx`) — INSERT append · UPDATE replace · DELETE remove · reaction patch · เลิก `loadComments()` ใน normal path
3. ยังใช้ Postgres Changes ได้ชั่วคราว แต่ **patch payload** (ไม่ reload ทั้งชุด)
4. dedup ด้วย event id + reconnect แล้ว scoped sync + tests ครบ

**ยังไม่แตะรอบนี้:** Orders/Sales domain events, row_version, broadcast, CRM aggregation, presence — เป็น Phase 2+ (ต้อง migration + load test + rollout flags)

**เกณฑ์วัดผล Phase 1 (ใช้ `rtDiag`):** notif/comment event → `refetchByTable` ของ 2 ตารางนี้ = 0 (patch แทน reload) · `queryByTable` ไม่โต

---

## 5. Rollback
Phase 0 เป็น instrument ล้วน — ถอยได้โดย revert commit เดียว · prod ไม่ได้รับผล (dev-only) · ไม่มี migration/schema change · behavior เดิม 100%
