# ai-extract — Edge Function สำหรับให้ AI กรอกฟอร์มจากรูป

โปรกซี่ฝั่งเซิร์ฟเวอร์ตัวเดียวที่ถือ `ANTHROPIC_API_KEY` (ห้ามให้คีย์อยู่ใน client bundle เด็ดขาด)
รับรูป/ข้อความ → ให้โมเดลสกัดข้อมูลออกมาเป็น JSON ตาม schema → ส่งกลับให้เว็บเอาไป **เติมฟอร์ม** (ไม่บันทึกเอง)

```
[มือถือถ่ายรูป] → เว็บย่อรูป 1568px → supabase.functions.invoke('ai-extract')
                                          │  แนบ JWT ผู้ใช้อัตโนมัติ
                                          ▼
                            ┌─────────────────────────────┐
                            │ ai-extract (Deno)           │
                            │ 1. เช็ค session + role       │  ← กันเผา token / กัน RLS ที่ยัง defer
                            │ 2. ยิง Claude (หรือ Ollama)  │
                            │ 3. คืน JSON ตาม schema       │
                            └─────────────────────────────┘
                                          ▼
                       เว็บ pre-fill ฟอร์ม → คน "ตรวจก่อนบันทึก" → กดเซฟ
```

## หลักการ (อ่านก่อน)
- **AI เสนอ คนตัดสิน** — output ไปเติมหน้า "ตรวจสอบก่อนบันทึก" เดิมเท่านั้น ไม่เคย auto-save
- **extraction-only** — ฟังก์ชันนี้รับแค่ `{task, image|text, hint}` *ไม่เคย* รับชื่อตาราง/payload เขียนจาก client (กัน confused-deputy)
- **เช็ค role ก่อนยิงโมเดล** — เฉพาะ admin/editor; ป้องกันคนสุ่มยิงเผา token
- **degrade graceful** — ถ้ายังไม่ deploy/ยังไม่ใส่คีย์ → เว็บโชว์ error เป็นภาษาไทย แล้วผู้ใช้พิมพ์เองได้ตามปกติ (ไม่บล็อกงาน)

## Deploy (ทำครั้งเดียว)
ต้องมี [Supabase CLI](https://supabase.com/docs/guides/cli) และ login + link project แล้ว

```bash
# 1) ตั้งคีย์ Claude เป็น secret (อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้ามใช้ VITE_ )
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# 2) deploy ฟังก์ชัน
supabase functions deploy ai-extract
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` มีให้อัตโนมัติในรันไทม์ Edge Function — ไม่ต้องตั้งเอง

เสร็จแล้วเปิดเว็บ → เข้าฟอร์ม "รับเข้าสต็อก" → ปุ่ม **"ถ่ายใบส่งของ → ให้ AI กรอก"** จะใช้งานได้ทันที

## สลับเป็น Ollama (เครื่องตัวเองในออฟฟิศ)
เครื่อง Ollama อยู่ใน LAN (เช่น `192.168.1.179:11434`) คลาวด์เรียกตรงไม่ได้ ต้องเปิดทาง:

```bash
# บนเครื่องที่รัน Ollama: เปิด Cloudflare Tunnel ให้เข้าจากภายนอกได้
cloudflared tunnel --url http://192.168.1.179:11434
# จะได้ URL แบบ https://xxxx.trycloudflare.com

supabase secrets set AI_PROVIDER=ollama
supabase secrets set OLLAMA_URL=https://xxxx.trycloudflare.com
supabase secrets set OLLAMA_MODEL=qwen2.5vl:7b   # โมเดล vision
supabase secrets set OLLAMA_SECRET=<สุ่มมาสักชุด>  # (ออปชัน) กัน URL หลุดแล้วใครก็ยิง
supabase functions deploy ai-extract
```
> RTX 3050 6GB รันโมเดล vision 7B ได้ แต่ช้า/อาจคับ VRAM — แนะนำ **ไฮบริด**: งานข้อความใช้ Ollama, รูปลายมือยากๆ ใช้ Claude (ตั้ง `AI_PROVIDER=claude` ไว้ก่อนได้)

## env ทั้งหมด
| ชื่อ | จำเป็น | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ใช่ (provider=claude) | — | คีย์ Claude |
| `AI_PROVIDER` | ไม่ | `claude` | `claude` \| `ollama` |
| `OLLAMA_URL` | ใช่ (provider=ollama) | — | ปลายทาง Ollama (ผ่าน tunnel) |
| `OLLAMA_MODEL` | ไม่ | `qwen2.5vl:7b` | โมเดล vision |
| `OLLAMA_SECRET` | ไม่ | — | ส่งเป็น header `x-tmk-secret` |

## เพิ่ม task ใหม่
แก้ `TASKS` ใน [index.ts](index.ts) — ใส่ `{ model, prompt, schema }` หนึ่งก้อนต่อหนึ่งงาน
ตอนนี้มี `receipt` (ถ่ายใบส่งของ → กริด size×color ของ ReceiveModal)
ฝั่งเว็บเรียกผ่าน [`aiExtractFromImage(task, file, hint)`](../../../src/lib/aiExtract.js) แล้วเอา `res.data` ไปเติมฟอร์ม

## ทดสอบเร็วๆ (CLI)
```bash
supabase functions serve ai-extract   # รันโลคัล
# แล้วยิงจากเว็บที่ชี้ไป local function ปกติ (ต้องล็อกอินเป็น admin/editor)
```
