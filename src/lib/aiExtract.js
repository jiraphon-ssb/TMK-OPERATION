/* ============================================================
   TMK — เรียก AI สกัดข้อมูลจากรูป (ผ่าน Edge Function ai-extract)
   ============================================================
   - บีบรูปเป็น 1568px ก่อนส่ง (คุมต้นทุน image token + ความเร็ว)
   - เรียกผ่าน supabase.functions.invoke → แนบ token ผู้ใช้อัตโนมัติ
   - ไม่บล็อก: ถ้า Edge Function ยังไม่ deploy/คีย์ยังไม่ใส่ → โยน error ให้ UI โชว์ แล้วผู้ใช้พิมพ์เองได้
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { readImageCompressed } from '../components.jsx';

const TUNE = 1568; // px — ใหญ่พอให้ OCR ชัด (ค่า default ของ readImageCompressed คือ 256 ซึ่งเล็กไป)

// สกัดข้อมูลจากไฟล์รูป → คืน { ok, data, usage, model, provider }
export async function aiExtractFromImage(task, file, hint = {}) {
  const dataUrl = await readImageCompressed(file, TUNE, 0.85);
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('อ่าน/ย่อรูปไม่สำเร็จ');
  return invokeExtract({ task, image: { mediaType: m[1], dataBase64: m[2] }, hint });
}

// สกัดจากข้อความ (เช่น วาง CSV จาก marketplace) — เผื่ออนาคต
export async function aiExtractFromText(task, text, hint = {}) {
  return invokeExtract({ task, text, hint });
}

async function invokeExtract(body) {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const { data, error } = await supabase.functions.invoke('ai-extract', { body });
  if (error) {
    // supabase-js โยน FunctionsHttpError ที่ message เป็น generic ('non-2xx status code') + data=null
    // ข้อความไทยจริงอยู่ใน error.context (Response) ต้องอ่านเอง
    let serverMsg = '', status = 0;
    try {
      status = error.context?.status || 0;
      const detail = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
      serverMsg = detail?.error || '';
    } catch { /* network fail (FunctionsFetchError) — ไม่มี body */ }
    throw new Error(humanize(serverMsg, status, error.message));
  }
  if (!data || data.ok !== true) throw new Error(data?.error || 'AI ไม่ตอบกลับ');
  return data;
}

function humanize(serverMsg, status, rawMsg) {
  if (serverMsg) return serverMsg;                       // ข้อความไทยจาก Edge Function (403/400/500 ฯลฯ)
  if (status === 401) return 'ต้องล็อกอินก่อนใช้ AI';
  if (status === 403) return 'เฉพาะแอดมิน/ผู้แก้ไขเท่านั้นที่ใช้ AI ได้';
  if (status === 404 || /Failed to send|fetch|network|Function not found|404/i.test(String(rawMsg || ''))) {
    return 'ยังเรียก AI ไม่ได้ — ฟังก์ชัน ai-extract ยังไม่ถูก deploy หรือคีย์ยังไม่ตั้ง (พิมพ์เองได้ตามปกติ)';
  }
  return String(rawMsg || '') || 'เรียก AI ไม่สำเร็จ';
}
