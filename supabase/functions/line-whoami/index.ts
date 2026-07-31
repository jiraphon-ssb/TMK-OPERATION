// ============================================================
//  TMK — line-whoami  (Supabase Edge Function, Deno)
// ============================================================
//  ตัวช่วย "ครั้งเดียว" เพื่อดึง groupId / userId ปลายทางที่จะส่งรายงานเข้า
//  ปัญหา: LINE ไม่มีหน้าคอนโซลบอก groupId ของกลุ่ม — ต้องอ่านจาก webhook event เท่านั้น
//
//  วิธีใช้ (ทำครั้งเดียวตอน setup):
//   1) deploy:  supabase functions deploy line-whoami --no-verify-jwt
//   2) เอา URL ไปวางที่ LINE Developers → ช่อง Messaging API → Webhook URL แล้วเปิด Use webhook
//   3) เชิญบอทเข้ากลุ่มทีม → พิมพ์ "id" (หรืออะไรก็ได้) ในกลุ่ม
//   4) บอทจะตอบกลับ groupId มาในแชต → ก๊อปไปตั้ง secret LINE_TARGET_ID
//   5) เสร็จแล้ว "เอา Webhook URL ออก / ปิด Use webhook" ได้เลย (ไม่ต้องใช้ต่อ)
//
//  หมายเหตุ: helper นี้ตอบกลับด้วย replyToken (ตอบในแชตที่ส่งมา) เท่านั้น
//  ไม่เก็บ ไม่ส่งต่อ ไม่ทำอย่างอื่น — ปลอดภัยที่จะเปิดชั่วคราว
// ============================================================

const OK = () => new Response("OK", { status: 200 }); // LINE ต้องได้ 200 เสมอ

Deno.serve(async (req) => {
  if (req.method !== "POST") return OK();
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  try {
    const body = await req.json();
    const events = Array.isArray(body?.events) ? body.events : [];
    for (const ev of events) {
      const src = ev?.source || {};
      const id = src.groupId || src.roomId || src.userId || "(ไม่พบ id)";
      const kind = src.groupId ? "groupId" : src.roomId ? "roomId" : "userId";
      const replyToken = ev?.replyToken;
      const text = `✅ ${kind}:\n${id}\n\nเอาค่านี้ไปตั้ง secret LINE_TARGET_ID ได้เลย`;
      if (replyToken && token) {
        await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
        });
      }
    }
  } catch { /* LINE verify ping / body ว่าง → ตอบ 200 เฉยๆ */ }
  return OK();
});
