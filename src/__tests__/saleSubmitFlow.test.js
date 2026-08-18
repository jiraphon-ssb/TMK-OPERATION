/* ============================================================
   saleSubmitFlow.test.js — กันขั้นตอนที่เพิ่งตัดออก "กลับมาใหม่"
   ============================================================
   ทั้ง 4 ข้อนี้เป็นเรื่องจำนวนคลิก/ข้อมูลหาย ซึ่งจับด้วย unit test ปกติไม่ได้
   (ต้องดูว่า "โครงมันยังต่ออยู่ไหม") → สแกนซอร์สแทน
   ============================================================ */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const submit = fs.readFileSync(path.join(SRC, 'views-sale-submit.jsx'), 'utf8');

describe('ส่งยอด (A) — ลดคลิกตอนเลือกช่องทาง', () => {
  it('มีตัวตั้งช่องทางทั้งชุดสำหรับใบที่ยังว่าง (เดิมต้องเลือกทีละใบ)', () => {
    expect(submit).toMatch(/patchAllMissingChannel/);
    expect(submit).toMatch(/missingChCount/);
  });

  it('ตัวตั้งทั้งชุดแตะเฉพาะใบที่ยังไม่มีช่องทาง และไม่แตะใบที่ติดปัญหา (hard)', () => {
    const fn = submit.slice(submit.indexOf('const patchAllMissingChannel'));
    expect(fn.slice(0, 400)).toMatch(/!r\.hard && !r\.channel/);
  });

  it('ตั้งช่องทางแล้วต้อง recompute สถานะทั้งชุด (เลขซ้ำข้ามแถวต้องอัปเดตตาม)', () => {
    const fn = submit.slice(submit.indexOf('const patchAllMissingChannel'));
    expect(fn.slice(0, 500)).toMatch(/deriveReceiptRowStatus/);
  });
});

describe('คนทัก (B) — คลิกเดียวถึงช่องกรอก + ไม่ทำข้อมูลหาย', () => {
  it('ปุ่มลัดเปิดฟอร์มตรง ไม่ผ่านการ์ดสรุปอีกชั้น (เดิมกดสองต่อ)', () => {
    // ตัดเฉพาะตัว LeadsQuickSheet (ถัดไปคือ SubmitQuickSheet ที่ใช้ SideSheet ของมันเอง)
    const from = submit.indexOf('export function LeadsQuickSheet');
    const to = submit.indexOf('export function SubmitQuickSheet');
    const quick = submit.slice(from, to > from ? to : undefined);
    expect(quick).toMatch(/startOpen/);
    expect(quick).toMatch(/hideCard/);
    // ต้องไม่ห่อ SideSheet ซ้อนอีกชั้น (FunnelCard เปิด sheet ของตัวเองอยู่แล้ว)
    expect(quick).not.toMatch(/<SideSheet/);
  });

  it('มีเตือนก่อนปิดเมื่อกรอกค้างไว้ — ครอบทั้ง ESC/คลิกนอก และปุ่ม "ปิด"', () => {
    // ⚠️ บทเรียน: เวอร์ชันแรกส่ง onClose={requestCloseForm} แล้วคิดว่าจบ
    //    แต่ SideSheet เรียก onClose "หลัง" ปิดชีตไปแล้ว (useAnimatedClose → doClose → setTimeout)
    //    → กล่องถามเด้งตอนชีตปิดไปแล้ว กดยกเลิกก็เปิดคืนไม่ได้ = ข้อมูลยังหาย
    //    ทางที่ทำงานจริงคือ prop confirmOnClose ซึ่งถูกเช็ค "ก่อน" ปิด
    const sheet = submit.slice(submit.indexOf('{open && <SideSheet'));
    expect(sheet.slice(0, 700)).toMatch(/confirmOnClose=\{touched\}/);   // ESC / คลิกนอก / ปุ่ม X
    expect(sheet.slice(0, 700)).toMatch(/onClose=\{closeForm\}/);        // ปิดจริงหลังยืนยันแล้ว
    // ปุ่ม "ปิด" ใน footer ไม่ผ่าน Radix → ต้องถามเองด้วย requestCloseForm
    expect(submit).toMatch(/const requestCloseForm = async \(\) => \{ if \(touched && !\(await confirmDiscard\(\)\)\)/);
    expect(submit).toMatch(/onClick=\{requestCloseForm\}/);
  });

  it('พิมพ์ตัวเลข/เสียงลูกค้า → ถือว่ามีของค้าง (touched)', () => {
    expect(submit).toMatch(/const setNum = \(p, field, v\) => \{ setTouched\(true\)/);
    for (const f of ['ask', 'praise', 'complaint']) {
      expect(submit).toMatch(new RegExp(`setTouched\\(true\\); setVoice\\(v => \\(\\{ \\.\\.\\.v, ${f}:`));
    }
  });

  it('โหลดค่าจาก DB / บันทึกสำเร็จ → เคลียร์ touched (ไม่เตือนทั้งที่ตรงกับ DB แล้ว)', () => {
    expect(submit).toMatch(/setTouched\(false\); \/\/ ค่าที่เพิ่งโหลด/);
    expect(submit).toMatch(/setExists\(true\); setTouched\(false\); closeForm\(\)/);
  });

  it('มี "คัดลอกเมื่อวาน" เหมือนฟอร์มกรอกยอดรายวัน และไม่ก๊อปเสียงลูกค้า', () => {
    expect(submit).toMatch(/const copyYesterday = async/);
    expect(submit).toMatch(/คัดลอกเมื่อวาน/);
    const fn = submit.slice(submit.indexOf('const copyYesterday'), submit.indexOf('const closeForm'));
    expect(fn).toMatch(/setLeads\(fillFromRow\(data\)\)/);
    expect(fn).not.toMatch(/setVoice/);   // เสียงลูกค้าเป็นข้อความเฉพาะวัน ก๊อปแล้วได้ข้อมูลปลอม
  });
});
