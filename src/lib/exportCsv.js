/* ============================================================
   exportCsv.js — ส่งออกตารางเป็นไฟล์ CSV (ดาวน์โหลดฝั่งเบราว์เซอร์)
   - ไม่เขียนกลับ Supabase/Sheet — เป็นไฟล์ดาวน์โหลดล้วน
   - ใส่ BOM (﻿) ให้ Excel อ่านภาษาไทยถูก
   - columns: [{ key, label, map? }] — map(row) มาก่อน key ถ้ามี
   ============================================================ */
const esc = (v) => {
  if (v == null) v = '';
  // ปัดเศษทศนิยมลอย (เช่น 408115.66999999987 → 408115.67) ส่วนจำนวนเต็มไม่แตะ
  if (typeof v === 'number' && !Number.isInteger(v)) v = Math.round(v * 100) / 100;
  v = String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};

export function toCsv(rows, columns) {
  const head = columns.map(c => esc(c.label)).join(',');
  const body = (rows || []).map(r =>
    columns.map(c => esc(c.map ? c.map(r) : r[c.key])).join(',')
  ).join('\r\n');
  return head + '\r\n' + body;
}

// แปะวันที่ลงชื่อไฟล์ — รับ Date จาก caller (สคริปต์นี้ไม่เรียก new Date() เอง)
export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.csv$/i.test(filename) ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return (rows || []).length;
}
