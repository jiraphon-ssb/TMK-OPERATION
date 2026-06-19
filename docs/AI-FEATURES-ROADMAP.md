# TMK × AI — โรดแมปฟีเจอร์ผู้ช่วย AI (Claude)

> เอกสารวิจัย/ออกแบบ — ยังไม่ลงมือ ใช้เป็นแผนอ้างอิง
> ที่มา: ไอเดียจากโพสต์เจ้าของธุรกิจที่ใช้ Claude ทำบัญชี/สต็อก (ถ่ายรูปใบเบิก/ใบออเดอร์ → AI กรอกให้) + วิจัยต่อยอดให้เข้ากับสแตก TMK จริง
> หลักการแกน: **AI เสนอ — คนตัดสิน** ข้อมูล AI ต้องผ่านการ "ตรวจสอบก่อนบันทึก" ของคนเสมอ ไม่เขียนเข้า Supabase อัตโนมัติ

---

## 1. ภาพรวม (วิสัยทัศน์)

เปลี่ยน **กล้องมือถือ + กระดาษ** ให้เป็น "ชั้นกรอกข้อมูล" ของ TMK:
ถ่ายรูป/วางสรุปยอดรายวัน · ใบส่งของโรงงาน · ใบเบิกสต็อก · แชทออเดอร์ · ไฟล์ export จากมาร์เก็ตเพลส → **Claude เติมฟอร์ม (modal) ที่ทีมใช้อยู่แล้วให้** → คนกด "ตรวจสอบก่อนบันทึก" ตามเดิมก่อนเข้า Supabase

ทุกอย่างวางอยู่บน **โครงสร้างใหม่ชิ้นเดียวที่ repo ยังไม่มี**: Supabase **Edge Function** (Deno) ที่ถือ `ANTHROPIC_API_KEY` เป็น secret ฝั่งเซิร์ฟเวอร์ → ตรวจ session ผู้ใช้ → เช็ค role ใน `tmk_user_roles` ก่อนยิง → เรียก Claude แบบบังคับ JSON schema → คืนค่าที่ map ตรงเข้าฟอร์ม
สร้าง proxy ครั้งเดียว แล้วทุกฟีเจอร์ถัดไป = แค่ **schema ใหม่ + แม็ปเข้า modal เดิม**

---

## 2. ⚠️ สถาปัตยกรรม (ชิ้นที่ "ต้องมี" ก่อนทุกอย่าง)

TMK เป็น **client-only SPA (React+Vite) บน Vercel** → ไม่มีเซิร์ฟเวอร์ของตัวเองวันนี้

### ทำไมต้องมี Edge Function
`ANTHROPIC_API_KEY` **ห้ามอยู่ใน bundle ฝั่ง browser เด็ดขาด** (ต่างจาก Supabase anon key ที่ public โดยตั้งใจ) — ถ้าหลุด = ใครก็ดูดเครดิต Anthropic เราได้ → ต้องมี proxy ฝั่งเซิร์ฟเวอร์ถือ key

### โครง Edge Function `ai-extract` (Deno, ตัวเดียวจบ)
```
supabase/functions/ai-extract/index.ts
```
1. ตั้ง key เป็น secret: `supabase secrets set ANTHROPIC_API_KEY=...` — **ห้าม** เป็น `VITE_` (จะติดไป bundle)
2. รับ `Authorization: Bearer <user JWT>` → `supabase.auth.getUser(jwt)` → 401 ถ้าไม่มี
3. เช็ค `tmk_user_roles` (role ∈ admin/editor, `deleted_at is null`) → 403 ถ้าเป็น viewer — **เช็คก่อนยิง Claude (กันเผา token)** + ปิดช่องโหว่ RLS ที่ยัง defer
4. contract เดียว สลับด้วย field `task`:
   - request: `{ task, image:{mediaType,dataBase64} | imageUrl, text?, hint? }`
   - response: `{ ok, data:{...schema}, usage, model }`
5. เรียก `POST api.anthropic.com/v1/messages` (header `anthropic-version: 2023-06-01`) + รูปเป็น base64 image block + `output_config.format = {type:'json_schema', schema}` → **บังคับให้ตอบเป็น JSON ตาม schema** (ไม่ต้อง parse string เปราะๆ)
6. **extraction-only** — ฟังก์ชันนี้ห้ามรับชื่อตาราง/payload เขียนจาก client เด็ดขาด (กันเป็น "confused deputy" เขียนข้าม RLS)

### ฝั่ง React
- เพิ่ม hook `useVisionExtract(task)` + ปุ่ม `<ScanButton>` (ไอคอนกล้อง "สแกนรูป") หย่อนเข้า header ของ modal ไหนก็ได้
- ใช้ `<input type="file" accept="image/*" capture="environment">` (มือถือเปิดกล้องเลย)
- บีบรูปก่อนส่งด้วย `readImageCompressed(file, 1568, 0.85)` ที่มีอยู่แล้วใน [components.jsx](../src/components.jsx) — **ต้องส่งขนาด 1568 ชัดเจน** (ค่า default คือ 256px ซึ่งทำลายรายละเอียด OCR) + คุมต้นทุน image token (~1,600–4,784 tok/รูป)
- เรียกผ่าน `supabase.functions.invoke('ai-extract', {body})` — แนบ token ผู้ใช้ให้อัตโนมัติ ไม่ต้องลง dependency ใหม่

### Transport รูป
- **ค่าเริ่มต้น = base64 ใน body** (ไม่เก็บรูปที่ไหน — ดีสำหรับใบเสร็จ/ออเดอร์ที่มี PII)
- รูปสินค้าที่ต้องเก็บอยู่แล้ว → อัปขึ้น `tmk-images` bucket (มีอยู่) แล้วส่ง URL

---

## 3. 🎯 Phase 1 — สไลซ์แรก (พิสูจน์ทั้งระบบด้วยฟีเจอร์เดียว)

**เลือก: ถ่ายใบส่งของ/บิลโรงงาน → เติม ReceiveModal** (ความถี่ต่ำ = blast radius ต่ำ, reuse infra เดิมเยอะ, กริดให้คนตรวจชัด)

1. สร้าง `supabase/functions/ai-extract/index.ts` + ตั้ง secret
2. ใส่ CORS preflight (Allow-Headers: authorization, content-type, apikey สำหรับ origin Vercel) + auth/role gate ก่อนยิง
3. ship `task='receipt'` ตัวแรก — model `claude-haiku-4-5` (บิลพิมพ์ชัด) หรือ `claude-opus-4-8` (ลายมือกริด size×color)
4. ฝั่ง client: `<ScanButton>` ใน ReceiveModal → บีบรูป → invoke → เปิด modal **พร้อมค่าที่กรอกให้** (lotNo/date/cost/กริด) แต่ **ไม่ auto-save**
5. ติดชิป **"✨ จาก AI"** ที่ช่องที่ AI กรอก (กันกดผ่านมั่ว) → ปุ่ม "รับเข้าสต็อก" เดิม = จุดที่คนตรวจ
6. ตอนเซฟ → `logAudit({action:'create', entityType:'product', summary:'รับเข้า PO (กรอกด้วย AI จากรูป)', fields:[{label:'model',...},{label:'ค่า AI',value:'$'+est}]})` → ได้ audit + ต้นทุนต่อครั้งฟรี
7. เทส: ถ่ายใบจริง → เช็คฟอร์มเติมถูก → จงใจแก้เลขผิด 1 ช่อง → เซฟ → เช็คทั้งแถว `tmk_products` และ audit → **ผ่านครั้งเดียว = พิสูจน์ key-secrecy + auth + vision + structured output + human-review + audit พร้อมกัน**

---

## 4. แคตตาล็อกฟีเจอร์ (เรียงตามคุ้มค่า)

ระดับ: effort = S/M/L · value = สูง/กลาง/ต่ำ

### 🟢 ทำก่อน (คุ้มสุด)

| ฟีเจอร์ | E/V | ทำอะไร | เชื่อมตรงไหน | Claude |
|---|---|---|---|---|
| **Edge Function proxy + auth gate** | M/สูง | โครงพื้นฐาน (ต้องมี) ถือ key + เช็ค role | ใหม่ `supabase/functions/` | — |
| **ถ่ายใบส่งของ → ReceiveModal** ⭐Phase1 | M/สูง | กรอกกริด size×color + lot/date/cost | [ReceiveModal](../src/modals.jsx) | Vision + schema · Opus 4.8 (ลายมือกริด) |
| **ถ่าย/วางสรุปยอดรายวัน → RecordSalesModal** | M/สูง | ดึง rev/ord/ad/ลูกค้าใหม่-เก่า ต่อช่อง/วัน | RecordSalesModal (`rows` state) | Vision/text · Sonnet 4.6 (จอ), Haiku (CSV) |
| **กระทบยอด export กับที่บันทึกไว้** | M/สูง | diff ไฟล์ vs `tmk_daily_sales` ต่อ field | RecordSalesModal step 2 | **JS ล้วน $0** (Claude แค่ parser) |
| **ถาม-ตอบยอดด้วยภาษาไทย (NL query)** | M/สูง | "ยอด FB เดือนนี้?" ตอบใน ⌘K QuickFind | QuickFind modal | Sonnet 4.6 · context = computeMonth จริง |
| **อินไซต์/แจ้งเตือนเชิงรุก** | L/สูง | "TikTok ROAS ตก 3 วัน — โยกงบ" | HomeView ศูนย์เตือน (กลุ่ม AI แยก) | Sonnet 4.6 · วันละครั้ง cache ~฿18/ด. |

### 🟡 ทำต่อ (กลาง)

| ฟีเจอร์ | E/V | ทำอะไร | Claude |
|---|---|---|---|
| **ตรวจเลขผิดปกติตอนกรอกยอด** | M/กลาง | เสริมกฎ 3× เดิม (ad>rev, AOV เพี้ยน) — advisory ไม่บล็อก | Haiku 4.5 · timeout 2s fallback กฎเดิม |
| **ถ่ายใบเบิก/ใบนับสต็อก → StockAdjustModal** | M/กลาง | แต่ละบรรทัด → ปรับสต็อก (lot/สี/ไซส์/เหตุผล/จำนวน) | Sonnet 4.6 · เหตุผล (บวก/ลบ) ให้คนยืนยัน |
| **ถ่ายใบออเดอร์/แชท → OrderModal** | L/กลาง | ลูกค้า+รายการ+ส่วนลด+ช่อง+tracking | Sonnet 4.6 · ระวัง PII (ไม่เก็บรูป), match สินค้าไม่ auto |
| **นำเข้าออเดอร์จาก export → ร่าง tmk_orders** | L/กลาง | parse ต่อออเดอร์ → match สินค้าตาม SKU/ชื่อ | Haiku (CSV)/Sonnet · ยืนยันทุกบรรทัดที่ match ไม่ได้ |
| **สรุปประจำวัน/บรีฟ + ย่อ audit log** | S/กลาง | บรีฟไทย 4-6 บรรทัด: ยอด vs pace, ช่องดี/แย่, อะไรเปลี่ยน | Haiku ฿0.15 / Sonnet ฿0.4 ต่อครั้ง |
| **ข้อเสนอเติมสต็อก & กลุ่มลูกค้า** | M/กลาง | จัดอันดับ+อธิบายของที่ควรเติม (ไม่คิดจำนวนเอง) | Haiku 4.5 ~฿0.02/run |
| **ออโต้หมวดหมู่/คำโปรยจากรูปสินค้า** | M/กลาง | จากรูปที่อัปอยู่แล้ว → หมวด(enum)/blurb/สี | Sonnet vision · ไม่ทับช่องที่คนพิมพ์แล้ว |

### ⚪ ทำทีหลัง (ต่ำ/เสริม)

| ฟีเจอร์ | E/V | หมายเหตุ |
|---|---|---|
| **ถ่ายป้าย/บาร์โค้ด → ProductModal** | S/ต่ำ | Haiku ~$0.004 · บาร์โค้ดใช้ `BarcodeDetector` ฝั่ง client ดีกว่า |
| **ถ่ายใบสั่งผลิต/ใบเสนอราคา → POModal** | S/ต่ำ | Haiku · ระวังปี พ.ศ./ค.ศ. + dd/mm, ชื่อสินค้าต้องตรง catalog |

---

## 5. รายละเอียดฟีเจอร์เด่น (schema + การ map)

### ถ่ายใบส่งของ → ReceiveModal (Phase 1)
- **input:** รูปใบ packing slip (มักลายมือ แยก size×color + จำนวน)
- **schema:** `{ lotNo, date:'YYYY-MM-DD', costPerUnit:number, grid:[{color:string, size:enum(SIZES), qty:int}] }`
- **hint:** ชื่อสีที่สินค้านั้นมี + SIZES → Claude normalize "ดำ/แดง/S/M/L"; client map ชื่อสี → colorId
- **map:** เข้า `lot` state ของ ReceiveModal → กด "รับเข้าสต็อก" → `mutateProductRow` ต่อ lot เข้า `tmk_products.lots` + คิด stock ใหม่ + ปิด PO
- **model:** Opus 4.8 (กริดลายมือ 2 มิติ พลาดแล้วสต็อกเพี้ยนเงียบ — คุ้มที่จะแม่น)

### ถ่าย/วางสรุปยอดรายวัน → RecordSalesModal
- **schema:** `{ date, channels:[{id:enum(ช่อง 6 id), rev, ord, ad, newC, oldC}], avgReplyMinutes, note }`
- **สำคัญ:** ใช้ channel id มาตรฐาน (`facebook/tiktok/shopee/crm/lazada/line`) · **ห้าม emit `inq`** (TMK คิด inq = newC+oldC เอง)
- **map:** เข้า `rows` state → ผู้ใช้ลง step 1 → "ตรวจสอบก่อนบันทึก" → `handleSave` upsert `tmk_daily_sales` (คง guard ">3× ค่าเฉลี่ย" + บล็อกวันอนาคต)
- **multi-image:** ให้สแกนหลายรูปรวมเข้าวันเดียว (merge ตาม channel id)

### กระทบยอด (reconciliation)
- diff เป็น **JS ล้วน** เทียบ `TMK.dailyAll[].ch[id]` (โหลดอยู่ในหน่วยความจำแล้ว) field-by-field, tolerance ฿1 (กัน rounding)
- โชว์ "Shopee ฿12,400 (ไฟล์) vs ฿11,900 (บันทึกไว้)" → ปุ่ม "ใช้ค่าจากไฟล์ / คงค่าเดิม" ต่อ field — **ไม่ auto-overwrite** · ถ้าไม่มีค่าเดิมโชว์ "ไม่มีค่าเดิม"

### NL query / insights / briefing
- **ต้อง re-derive context ด้วย `computeMonth` อันเดียวกับ dashboard** (MTD, ACOS_TOT, PACE_PCT) — ถ้าเลข AI ต่างจากหน้าจอแม้บาทเดียว ทีมเลิกเชื่อทั้งระบบ
- pin threshold จริงของร้าน (ACOS_CEIL, AD_BUDGET, TARGET) · สั่ง "ตอบจาก context เท่านั้น ไม่มีให้บอก 'ไม่มีข้อมูล'" · ห้ามแนะนำสิ่งที่แอปทำไม่ได้

---

## 6. โมเดล & ต้นทุน

| โมเดล | $/1M (in/out) | ใช้เมื่อ |
|---|---|---|
| `claude-haiku-4-5` | $1 / $5 | ตัวเลขพิมพ์ชัด, CSV, key-value ง่าย (ถูก/เร็ว) |
| `claude-sonnet-4-6` | $3 / $15 | ตารางหลายแถว, ลายมือผสมไทย, จอที่เลย์เอาต์หลากหลาย |
| `claude-opus-4-8` | $5 / $25 | กริดลายมือยากๆ ที่พลาดแล้วแพง |

**ต้นทุนจริง (ใบเสร็จ ~2,000 img tok + 300 in + 400 out):** Haiku ≈ **$0.004** (ไม่ถึงครึ่งเซนต์) · Sonnet ≈ $0.013 · Opus ≈ ไม่กี่เซนต์
- 50 สแกน/วัน บน Haiku ≈ **$0.20/วัน (~$6/เดือน)**
- กระทบยอด (diff) = **$0**
- NL query Sonnet ≈ ฿0.5–0.8/คำถาม · insights วันละครั้ง cache ≈ ฿18/เดือน
- **ครบทั้ง ~14 ฟีเจอร์ ≈ ระดับสิบกว่าดอลลาร์/เดือน** — ต้นทุนจริงคือ M-effort ครั้งเดียวสร้าง Edge Function

**3 วินัยคุมต้นทุน:** (1) บีบรูป 1568px เสมอ (รูป 4000px เพิ่ม image token ~3 เท่าเงียบๆ) · (2) prompt-cache schema/system prompt · (3) gate role ก่อนยิง + เขียน model+ต้นทุนลง audit

---

## 7. ความเสี่ยง & การ์ดกัน (สำคัญสุด)

1. **API key หลุดเข้า bundle = หายนะ** → key อยู่แค่ใน Deno runtime ผ่าน `supabase secrets set` เท่านั้น ห้าม `VITE_`/`.env` ที่ bundle
2. **RLS ยัง defer → service-role key ทรงพลัง** → ฟังก์ชันต้อง extraction-only, ห้ามรับชื่อตาราง/payload เขียนจาก client, gate role ก่อนยิง
3. **กดผ่านมั่ว (rubber-stamp)** → ชิป "✨ จาก AI" ทุกช่องจน user แตะ · คง guard เดิม (3× ค่าเฉลี่ย, บล็อกวันอนาคต) · ไม่ auto-advance
4. **ความแม่นภาษาไทย/ลายมือ ในช่องที่เป็นเงิน** → Opus เฉพาะกริดยาก · กริด/พรีวิว "คงเหลือ N → newQty" ต้องเด่น · normalize ไซส์ (2XL vs XXL) · cost บางทีต่อโหล ให้คนตรวจ
5. **เลข AI ต่างจาก dashboard = ฆ่าความเชื่อใจ** → re-derive ด้วย computeMonth เป๊ะ
6. **PII + การเก็บรูป** → ออเดอร์/แชทมีชื่อ/เบอร์/ที่อยู่ → ฟังก์ชันไม่ log ไม่เก็บรูป (ใช้ base64-in-body) · ไม่ dump base64 ลง audit
7. **ต้นทุนบาน** → บีบรูป + route model + (อนาคต) มี per-day spend ceiling ก่อนเปิด bulk path
8. **ขอบคม operational** → CORS preflight, cold-start ~200-500ms (โชว์ spinner), AI ล่ม = degrade graceful (ไม่บล็อกการเซฟ)

---

## 8. หลักการที่ไม่เปลี่ยน

- **AI เสนอ คนตัดสิน** — AI เติมฟอร์มเท่านั้น คนกดยืนยันก่อนเข้า Supabase ทุกครั้ง
- **กรอกในเว็บคือความจริง** — เหมือน Google Sheet export ที่เป็น read-only mirror; AI ก็แค่ "ผู้ช่วยกรอก"
- **ทุก AI action ลง audit** (model + ต้นทุนโดยประมาณ)
- สร้าง proxy ครั้งเดียว → ฟีเจอร์ถัดไป = schema + แม็ป

---

*สร้างจากการวิจัยแบบ multi-agent (4 ด้าน: photo extraction / reconciliation / intelligence / architecture) + อ้างอิงโค้ด TMK จริง + Claude API reference*
