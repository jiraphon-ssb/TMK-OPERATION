// ============================================================
//  TMK — ai-extract  (Supabase Edge Function, Deno)
// ============================================================
//  Proxy เดียวที่ถือ ANTHROPIC_API_KEY ฝั่งเซิร์ฟเวอร์ (ห้ามอยู่ใน client bundle)
//  - ตรวจ session + role (admin/editor) ก่อน "ก่อนยิง" ทุกครั้ง (กันเผา token + ปิดช่อง RLS ที่ยัง defer)
//  - บังคับ output เป็น JSON ตาม schema ด้วย tool-use (เสถียร ไม่ต้องพึ่ง beta)
//  - extraction-only: รับแค่ {task, image/text, hint} → คืน {ok, data, usage, model}
//    *** ห้าม *** รับชื่อตาราง/payload เขียนจาก client (กัน confused-deputy)
//  - provider-agnostic: 'claude' (ค่าเริ่มต้น) | 'ollama' (สลับด้วย env AI_PROVIDER / per-task)
//
//  Deploy:  supabase functions deploy ai-extract
//  Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//  (ดู README.md)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // ปรับเป็นโดเมน Vercel จริงได้ถ้าต้องการเข้มขึ้น
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// ---------- งานที่รองรับ: schema + โมเดล + prompt (ขยายเพิ่มได้ทีละ task) ----------
const TASKS: Record<string, { model: string; prompt: string; schema: Record<string, unknown> }> = {
  // ถ่ายใบส่งของ/บิลโรงงาน → กริด size×color สำหรับ ReceiveModal
  receipt: {
    model: "claude-sonnet-4-6", // ลายมือยุ่งมาก → เปลี่ยนเป็น claude-opus-4-8 เพื่อความแม่นได้
    prompt:
      "นี่คือรูปใบส่งของ/บิลรับสินค้าจากโรงงาน (อาจเป็นลายมือ) แยกจำนวนตาม สี × ไซส์. " +
      "ดึงข้อมูลออกมาให้ครบทุกช่องที่มีจำนวน ผ่านเครื่องมือ extract เท่านั้น. " +
      "size ต้องเป็นค่าใดค่าหนึ่งใน hint.sizes (แปลง XXL→2XL ฯลฯ). " +
      "color ใช้ชื่อตามที่เขียน (เทียบ hint.colors ถ้าตรง). qty เป็นจำนวนเต็มบวก. " +
      "ถ้ามีรหัสล็อต/วันที่(YYYY-MM-DD)/ต้นทุนต่อตัว ให้ใส่ด้วย; ไม่มีให้เว้นว่าง. ห้ามเดาช่องที่ว่าง.",
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        lotNo: { type: "string", description: "รหัสล็อต ถ้ามี" },
        date: { type: "string", description: "วันที่รับเข้า YYYY-MM-DD ถ้ามี" },
        costPerUnit: { type: ["number", "null"], description: "ต้นทุนต่อตัว ถ้ามี" },
        grid: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            properties: {
              color: { type: "string" },
              size: { type: "string" },
              qty: { type: "integer" },
            },
            required: ["color", "size", "qty"],
          },
        },
      },
      required: ["grid"],
    },
  },
  // เพิ่ม task อื่นที่นี่: 'sales' (RecordSalesModal), 'order', 'product', 'po' ...
};

// ---------- ผู้ให้บริการโมเดล ----------
async function callClaude(task: typeof TASKS[string], image: { mediaType: string; dataBase64: string } | null, text: string, hint: unknown) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ยังไม่ได้ตั้ง ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)");
  const content: unknown[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.dataBase64 } });
  content.push({ type: "text", text: `${task.prompt}\n\nhint = ${JSON.stringify(hint || {})}${text ? `\n\nข้อความ:\n${text}` : ""}` });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: task.model,
      max_tokens: 2048,
      // tool-use แบบบังคับ = ได้ JSON ตาม schema แน่นอน (ไม่ต้องพึ่ง beta / ไม่ parse string เปราะ)
      tools: [{ name: "extract", description: "ส่งข้อมูลที่ดึงได้กลับเป็น JSON ตาม schema", input_schema: task.schema }],
      tool_choice: { type: "tool", name: "extract" },
      messages: [{ role: "user", content }],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 200)}`);
  const block = (j.content || []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) throw new Error("Claude ไม่คืน tool_use");
  return { data: block.input, usage: j.usage, model: j.model };
}

async function callOllama(task: typeof TASKS[string], image: { mediaType: string; dataBase64: string } | null, text: string, hint: unknown) {
  const base = Deno.env.get("OLLAMA_URL"); // เช่น https://ollama-tmk.example.com (ผ่าน Cloudflare Tunnel)
  const model = Deno.env.get("OLLAMA_MODEL") || "qwen2.5vl:7b";
  if (!base) throw new Error("ยังไม่ได้ตั้ง OLLAMA_URL");
  const msg: Record<string, unknown> = {
    role: "user",
    content: `${task.prompt}\n\nhint = ${JSON.stringify(hint || {})}${text ? `\n\nข้อความ:\n${text}` : ""}`,
  };
  if (image) msg.images = [image.dataBase64]; // Ollama รับ base64 ตรงๆ
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = Deno.env.get("OLLAMA_SECRET"); // กัน URL หลุดแล้วใครก็ยิง
  if (secret) headers["x-tmk-secret"] = secret;
  const res = await fetch(`${base.replace(/\/$/, "")}/api/chat`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [msg], format: task.schema, stream: false, options: { temperature: 0 } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const raw = j?.message?.content || "{}";
  return { data: JSON.parse(raw), usage: { ollama: true }, model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    // ---- auth: ยืนยันตัวตนจาก JWT ของผู้ใช้ + เช็ค role ก่อนยิงโมเดล ----
    const authz = req.headers.get("Authorization") || "";
    const jwt = authz.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ ok: false, error: "ต้องล็อกอินก่อน" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !u?.user) return json({ ok: false, error: "session ไม่ถูกต้อง" }, 401);
    const email = (u.user.email || "").toLowerCase();

    const { data: role } = await admin
      .from("tmk_user_roles")
      .select("role")
      .ilike("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    if (!role || !["admin", "editor"].includes(role.role)) {
      return json({ ok: false, error: "เฉพาะแอดมิน/ผู้แก้ไขเท่านั้น" }, 403);
    }

    // ---- รับ request (extraction-only) ----
    const body = await req.json().catch(() => ({}));
    const task = TASKS[body?.task];
    if (!task) return json({ ok: false, error: "task ไม่รองรับ" }, 400);
    const image = body?.image?.dataBase64 ? { mediaType: body.image.mediaType || "image/jpeg", dataBase64: body.image.dataBase64 } : null;
    const text = typeof body?.text === "string" ? body.text : "";
    const hint = body?.hint ?? {};
    if (!image && !text) return json({ ok: false, error: "ต้องมีรูปหรือข้อความ" }, 400);

    // ---- เลือก provider ----
    const provider = (Deno.env.get("AI_PROVIDER") || "claude").toLowerCase();
    const out = provider === "ollama"
      ? await callOllama(task, image, text, hint)
      : await callClaude(task, image, text, hint);

    return json({ ok: true, ...out, provider });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});
