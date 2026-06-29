# line-broadcast — Edge Function ส่งบรอดแคสต์ LINE OA

ส่งข้อความถึงผู้ติดตาม LINE Official Account (broadcast) หรือเจาะจง userIds (multicast)
ผ่านโปรกซี่ฝั่งเซิร์ฟเวอร์ที่ถือ token (ห้ามให้ token อยู่ใน client bundle)

```
[เว็บ CRM] เลือกข้อความ → supabase.functions.invoke('line-broadcast', { body:{ message } })
                                   │  แนบ JWT ผู้ใช้อัตโนมัติ
                                   ▼
                  line-broadcast (Deno) → เช็ค session/role → ยิง LINE Messaging API
```

## หลักการ
- **secret ฝั่ง server เท่านั้น** — `LINE_CHANNEL_ACCESS_TOKEN` ไม่อยู่ใน client
- **เช็ค role** ก่อนส่ง (admin/editor) — กันคนนอกยิง
- **graceful** — ยังไม่ deploy/ไม่ใส่ token → เว็บโชว์ error ภาษาไทย ไม่พังหน้าอื่น

## ⚠️ ข้อจำกัด targeting ตาม segment
LINE `broadcast` ส่งถึง **ผู้ติดตาม OA ทั้งหมด** — ไม่สามารถเจาะ segment/tag ของเราได้
เพราะข้อมูลลูกค้าเราเก็บ เบอร์/โซเชียล ไม่ใช่ **LINE userId**.
การยิงเจาะกลุ่ม (multicast) ต้องมี LINE userId ของลูกค้า ซึ่งต้องเก็บผ่าน **LINE webhook + LINE Login**
(เฟสถัดไป: `line-webhook` แมพ userId ↔ ลูกค้า). ตอนนี้ใช้ได้แบบ broadcast-ทั้งหมด.

## Deploy (ทำครั้งเดียว)
```bash
# 1) ตั้ง LINE Channel access token (จาก LINE Developers Console → Messaging API)
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxx

# 2) deploy
supabase functions deploy line-broadcast
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` มีให้อัตโนมัติในรันไทม์ — ไม่ต้องตั้งเอง

## ทดสอบ
เปิดเว็บ → CRM → "บรอดแคสต์" → พิมพ์ข้อความ → ส่ง → เช็คใน LINE OA
