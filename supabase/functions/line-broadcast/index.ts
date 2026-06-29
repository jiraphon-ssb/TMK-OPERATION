// ============================================================
// line-broadcast — Edge Function ส่งบรอดแคสต์ LINE OA (P3-C4)
// ============================================================
// โปรกซี่ฝั่งเซิร์ฟเวอร์ที่ถือ LINE_CHANNEL_ACCESS_TOKEN (ห้ามอยู่ใน client bundle)
// รับ { message, to? } → ยิง LINE Messaging API:
//   - มี to[] (LINE userIds) → multicast (เจาะจง)
//   - ไม่มี to → broadcast (ผู้ติดตาม OA ทั้งหมด)
// หลักการเดียวกับ ai-extract: เช็ค session ก่อน, secret ฝั่ง server, graceful
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) return json({ error: 'ยังไม่ได้ตั้ง secret LINE_CHANNEL_ACCESS_TOKEN' }, 500);

    // ตรวจผู้ใช้ (กันคนนอกยิง) — เช็ค session ผ่าน JWT ที่แนบมา
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    // เช็ค role admin/editor (graceful — ถ้าตารางไม่มีก็ปล่อยผ่าน เหมือน ai-extract)
    try {
      const { data: role } = await sb.from('tmk_user_roles').select('role').eq('email', user.email).maybeSingle();
      if (role && !['admin', 'editor'].includes(role.role)) return json({ error: 'สิทธิ์ไม่พอ (เฉพาะแอดมิน/ผู้แก้ไข)' }, 403);
    } catch { /* ไม่มีตาราง role → ปล่อยผ่าน */ }

    const { message, to } = await req.json();
    if (!message || !String(message).trim()) return json({ error: 'ข้อความว่าง' }, 400);

    const useMulticast = Array.isArray(to) && to.length > 0;
    const endpoint = useMulticast
      ? 'https://api.line.me/v2/bot/message/multicast'
      : 'https://api.line.me/v2/bot/message/broadcast';
    const body = useMulticast
      ? { to, messages: [{ type: 'text', text: String(message).slice(0, 4900) }] }
      : { messages: [{ type: 'text', text: String(message).slice(0, 4900) }] };

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const t = await r.text(); return json({ error: 'LINE API ตอบกลับผิดพลาด: ' + t }, 502); }
    return json({ ok: true, mode: useMulticast ? 'multicast' : 'broadcast' });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
