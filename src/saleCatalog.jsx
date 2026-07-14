/* ============================================================
   saleCatalog.jsx — แคตตาล็อกเสื้อ (Sale → แคตตาล็อกเสื้อ) → tmk_shirt_catalog
   ตารางเดียว เน้นข้อมูล — ไม่มีระบบรูปแล้ว (PART 42 · คอลัมน์ image ใน DB คงไว้ ไม่แตะ)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, invalidateSaleCache } from './lib/saleData.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag, stockMeta } from './components.jsx';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { Modal, SideSheet } from './modals-core.jsx';
import { logAudit } from './lib/audit.js';
import { logCatalogVersion, fetchCatalogVersions } from './lib/catalogVersions.js';
import { GOLDEN_DESIGNS, COLOR_TH2CODE } from './lib/shirtCatalog.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Toggle } from '@/components/ui/toggle';
import { SearchInput } from '@/components/ui/search-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SortableTable } from './components/DataTableParts.jsx';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toast = (m, t) => window.__toast && window.__toast(m, t);
const uid = () => 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const normCode = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');   // จับคู่ catalog.code ↔ products.sku

// คอลัมน์ที่ตารางใช้จริง (เลิก select '*') — ไม่ดึง image/images แล้ว (เลิกใช้รูป · ลด egress)
const CATALOG_SEL = 'id,code,name,type,price,price_wholesale,colors,sizes,status,job_type,shirt_class,note,variants,updated_at';

const TYPES = ['เสื้อโปโล', 'เสื้อกล้าม', 'กระเป๋า', 'กล่องสุ่ม', 'ถุงเท้า', 'ของแถม/โปร', 'อื่นๆ'];
const STATUSES = ['พร้อมขาย', 'พรีออเดอร์', 'หมด', 'เลิกผลิต'];
const JOB_TYPES = ['ปลีก', 'OEM', 'DFT'];   // ประเภทงาน — ตรงกับ orders (ปลีก=รวมส่ง / OEM=สกรีนองค์กร / DFT=ผลิตตามสั่ง)
const SHIRT_CLASSES = ['เสื้อปกติ', 'เสื้อลายพิเศษ', 'เสื้อตราหน่วยงาน'];   // กลุ่มเสื้อ — แกนจัดประเภทอิสระ (ผู้ใช้นิยาม/จัดเอง)
const ADD_TYPE = '__add__';   // sentinel ตัวเลือก "เพิ่มหมวดใหม่…" ใน Select หมวด
const statusTone = (s) => ({ 'พร้อมขาย': 'var(--good)', 'พรีออเดอร์': 'var(--accent)', 'หมด': 'var(--bad)', 'เลิกผลิต': 'var(--ink-4)' }[s] || 'var(--ink-3)');

// หัวข้อกลุ่มฟิลด์ใน drawer
const SecHead = ({ children }) => <div className="cat-sec-head">{children}</div>;

// 10D — ประวัติการแก้ไข (versioned catalog) · ซ่อนเงียบถ้าตารางยังไม่ migrate หรือไม่มีประวัติ
const fmtWhen = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s || ''; } };
function CatalogHistory({ catalogId }) {
  const [rows, setRows] = useState(null);   // null = ยังไม่โหลด · [] = ไม่มี/ตารางไม่มี
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setRows(null);
    fetchCatalogVersions(catalogId, 20).then(r => { if (live) setRows(r); });
    return () => { live = false; };
  }, [catalogId]);
  if (!rows || rows.length === 0) return null;   // ไม่มีประวัติ/ตารางยังไม่มี → ซ่อนเงียบ
  return (
    <>
      <Separator />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="row between cat-hist-trigger" style={{ width: '100%', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer' }}>
            <SecHead>ประวัติการแก้ไข <span className="cap" style={{ color: 'var(--ink-4)' }}>({rows.length})</span></SecHead>
            <span style={{ display: 'inline-flex', color: 'var(--ink-4)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}><Icon name="chevD" /></span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="cat-hist-list" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            {rows.map((v, i) => (
              <div key={v.id} className="row between" style={{ gap: 8, padding: '6px 8px', borderRadius: 8, background: i === 0 ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name || v.code || '—'}{i === 0 && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>ล่าสุด</Badge>}</span>
                  <span className="cap" style={{ color: 'var(--ink-4)' }}>{fmtWhen(v.changed_at)}{v.changed_by && v.changed_by !== 'system' ? ' · ' + v.changed_by : ''}</span>
                </div>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(v.price)}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

// ตัวกรอง dropdown แบบเดียวกับหน้าออเดอร์/CRM (เลือกหลายอัน + เช็คบ็อกซ์)
function MultiSelect({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {label}
          {n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1">
          <span>{label}</span>
          {n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={(e) => { e.preventDefault(); onChange([]); }}>ล้าง</button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => (
          <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={(e) => { e.preventDefault(); toggle(o); }}>
            <span className="min-w-0 flex-1 truncate">{o || '(ไม่ระบุ)'}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const blank = () => ({ code: '', name: '', type: 'เสื้อโปโล', price: '', price_wholesale: '', colors: '', sizes: '', status: 'พร้อมขาย', job_type: 'ปลีก', shirt_class: 'เสื้อปกติ', note: '', variants: {} });
// variants อาจมาเป็น object (jsonb) หรือ string → คืน object เสมอ
const parseVariants = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
// แปลง row จาก DB → form (numeric เป็น string ในช่องกรอก)
const toForm = (it) => ({ ...blank(), ...it, price: it.price ?? '', price_wholesale: it.price_wholesale ?? '', variants: parseVariants(it.variants) });

// พาเลตสี/ไซซ์มาตรฐาน + ตัวช่วยแก้ไขแบบชิป
const COLOR_HEX = { 'ขาว':'#ffffff','ดำ':'#1a1a1a','กรม':'#1f2d50','กรมท่า':'#1f2d50','ฟ้า':'#4a8be0','น้ำเงิน':'#1f3aa0','เขียว':'#2f9e6e','เหลือง':'#e8c23b','แดง':'#c0392b','ชมพู':'#e06aa0','ม่วง':'#6b5ce0','ส้ม':'#e0772f','โอรส':'#e0772f','ครีม':'#efe7d2' };
const STD_COLORS = Object.keys(COLOR_TH2CODE);
const STD_SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL'];
const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const sizeRank = (s) => { const i = STD_SIZES.indexOf(s); return i < 0 ? 99 : i; };
// ข้อมูลที่ยังขาด (ราคา/สี/ไซซ์) — โชว์ badge เตือนสั้นๆ ในตาราง
const missingOf = (it) => {
  const m = [];
  if (!(Number(it.price) > 0)) m.push('ราคา');
  if (!splitList(it.colors).length) m.push('สี');
  if (!splitList(it.sizes).length) m.push('ไซซ์');
  return m;
};
// จุดสีเล็กในตาราง (แทนข้อความรายชื่อสี)
const ColorDots = ({ colors }) => {
  const list = splitList(colors);
  if (!list.length) return <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>;
  return (
    <span className="row" style={{ gap: 3, alignItems: 'center', flexWrap: 'wrap' }} title={list.join(', ')}>
      {list.slice(0, 6).map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: COLOR_HEX[c] || '#bbb', border: '1px solid var(--line)', display: 'inline-block' }} />)}
      {list.length > 6 && <span className="cap" style={{ color: 'var(--ink-4)' }}>+{list.length - 6}</span>}
    </span>
  );
};

/* ---------- Skeleton (ตารางเดียว) ---------- */
function CatalogSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-[22px]">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={16} /><Skel w={90} h={30} r={8} /></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 5 }).map((_, i) => <Skel key={i} w={i % 2 ? 78 : 56} h={26} r={8} />)}</div>
      </Card>
      <Card className="p-[22px]"><SkelTable cols={8} rows={9} /></Card>
    </div>
  );
}

export function ShirtCatalogView() {
  const [items, setItems] = useState(null);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = usePersistedState('tmk-catalog-typeF', []);
  const [statusF, setStatusF] = usePersistedState('tmk-catalog-statusF', []);
  const [jobF, setJobF] = usePersistedState('tmk-catalog-jobF', []);
  const [classF, setClassF] = usePersistedState('tmk-catalog-classF', []);
  const [stockF, setStockF] = usePersistedState('tmk-catalog-stockF', []);   // 10A — กรองสถานะสต็อก
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [edit, setEdit] = useState(null);      // form object หรือ null
  const [addType, setAddType] = useState(null); // string|null — โหมดพิมพ์หมวดใหม่ใน Select หมวด
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [skuOpen, setSkuOpen] = useState(false);   // ส่วนรหัส SKU ในฟอร์ม — พับไว้ก่อน (ลดความรก)
  // 10A — สถานะสต็อก: จับคู่ catalog.code ↔ tmk_products.sku (client-side, ไม่มี FK) → ป้ายใกล้หมด/หมดสต็อก
  const { version: dataVersion } = useData() || {};
  const stockByCode = useMemo(() => {
    const m = new Map();
    (TMK.products || []).forEach(p => { const k = normCode(p.sku); if (k) m.set(k, p); });
    return m;
  }, [dataVersion]);
  const stockOf = (code) => { const k = normCode(code); if (!k) return null; const p = stockByCode.get(k); return p && (p.stock === 'low' || p.stock === 'out') ? p.stock : null; };
  const stockBadge = (code) => { const s = stockOf(code); if (!s) return null; const m = stockMeta(s); return <Badge variant="outline" className="ml-1.5 align-middle text-[10px] font-medium" style={{ color: m.c, borderColor: m.c }}>{m.label}</Badge>; };
  const [importing, setImporting] = useState(false);
  const [askImport, setAskImport] = useState(false);

  // เรียงล่าสุดก่อน (cachedFetchAll ไม่ได้ order ฝั่ง server → sort ฝั่ง client)
  const sortByUpdated = (rows) => [...rows].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const load = async (force = false) => {
    // ใช้ cache กลาง (TTL 5นาที + dedup) — สลับหน้าออก/เข้าไม่ดึงซ้ำ · narrow คอลัมน์ (ไม่ดึง base64 ก้อนใหญ่)
    let r = await cachedFetchAll('tmk_shirt_catalog', CATALOG_SEL, force);
    // graceful: คอลัมน์ใหม่ (job_type/shirt_class) ยังไม่ถูก migrate → fallback select('*')
    if (r.error && /column|does not exist|job_type|shirt_class/i.test(r.error.message || '')) {
      r = await cachedFetchAll('tmk_shirt_catalog', '*', force);
    }
    if (r.error) {
      if (/relation|does not exist|tmk_shirt_catalog/i.test(r.error.message)) setNoTable(true);
      else setErr(r.error.message);
      setItems([]); return;
    }
    setNoTable(false); setItems(sortByUpdated(r.data || []));
  };
  useEffect(() => { load(); }, []);
  useSaleRealtime(['tmk_shirt_catalog'], () => load(true)); // แคตตาล็อกแก้ที่ไหน เห็นสดทุกเครื่อง
  useEffect(() => { if (!edit) { setAddType(null); setSkuOpen(false); } }, [edit]);   // ปิดชีต/เปลี่ยนรายการ → รีเซ็ตโหมดฟอร์ม

  const types = useMemo(() => { const s = new Set(); (items || []).forEach(i => { if (i.type) s.add(i.type); }); return [...s].sort(); }, [items]);
  const filtered = useMemo(() => {
    let r = items || [];
    if (typeF.length) r = r.filter(i => typeF.includes(i.type || ''));
    if (statusF.length) r = r.filter(i => statusF.includes(i.status || 'พร้อมขาย'));
    if (jobF.length) r = r.filter(i => jobF.includes(i.job_type || 'ปลีก'));
    if (classF.length) r = r.filter(i => classF.includes(i.shirt_class || 'เสื้อปกติ'));
    if (stockF.length) r = r.filter(i => { const s = stockOf(i.code); const lbl = s === 'out' ? 'หมดสต็อก' : s === 'low' ? 'ใกล้หมด' : null; return lbl && stockF.includes(lbl); });
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(i => `${i.code} ${i.name} ${i.type} ${i.colors} ${i.note}`.toLowerCase().includes(ql));
    return r;
  }, [items, typeF, statusF, jobF, classF, stockF, stockByCode, q]);
  const nFilters = typeF.length + statusF.length + jobF.length + classF.length + stockF.length;
  const activeChips = [
    ...typeF.map(v => ({ dim: 'หมวด', v, clear: () => setTypeF(typeF.filter(x => x !== v)) })),
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...jobF.map(v => ({ dim: 'งาน', v, clear: () => setJobF(jobF.filter(x => x !== v)) })),
    ...classF.map(v => ({ dim: 'กลุ่มเสื้อ', v, clear: () => setClassF(classF.filter(x => x !== v)) })),
    ...stockF.map(v => ({ dim: 'สต็อก', v, clear: () => setStockF(stockF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setTypeF([]); setStatusF([]); setJobF([]); setClassF([]); setStockF([]); };

  const save = async () => {
    if (!edit) return;
    if (!edit.code.trim() && !edit.name.trim()) { toast('ใส่รหัสหรือชื่อลายอย่างน้อย 1 อย่าง', 'error'); return; }
    setBusy(true);
    const row = {
      id: edit.id || uid(),
      code: edit.code.trim(), name: edit.name.trim(), type: edit.type || '',
      price: Number(edit.price) || 0, price_wholesale: Number(edit.price_wholesale) || 0,
      colors: (edit.colors || '').trim(), sizes: (edit.sizes || '').trim(), status: edit.status || 'พร้อมขาย',
      job_type: edit.job_type || 'ปลีก',
      shirt_class: edit.shirt_class || 'เสื้อปกติ',
      note: (edit.note || '').trim(), variants: edit.variants || {}, updated_at: new Date().toISOString(),
    };
    // ครอบ try/finally — upsert throw (network/client) จะได้ไม่ค้าง spinner "กำลังบันทึก"
    try {
      // ไม่แตะ image/images ใน DB (เลิกใช้รูปแล้ว — upsert ไม่ส่ง key = คงค่าเดิม)
      let { error } = await supabase.from('tmk_shirt_catalog').upsert(row, { onConflict: 'id' });
      // ยังไม่ได้รัน migration variants/job_type/shirt_class → ตัดคอลัมน์ที่ DB ยังไม่มีออก แล้วบันทึกส่วนที่เหลือ
      if (error && /variants|job_type|shirt_class/i.test(error.message)) {
        const row2 = { ...row };
        const dropCol = (re, col, label) => { if (re.test(error.message) && row2[col] !== undefined) { delete row2[col]; return label; } return null; };
        let dropped = [];
        // ตัดทุกคอลัมน์ที่ error ชี้ในรอบเดียว แล้วลองซ้ำ จนกว่าจะไม่มี error คอลัมน์ค้าง
        for (let pass = 0; pass < 4 && error && /variants|job_type|shirt_class/i.test(error.message); pass++) {
          const d = [
            dropCol(/variants/i, 'variants', 'รหัสรายตัว (variants)'),
            dropCol(/job_type/i, 'job_type', 'ประเภทงาน (job_type)'),
            dropCol(/shirt_class/i, 'shirt_class', 'กลุ่มเสื้อ (shirt_class)'),
          ].filter(Boolean);
          dropped = [...new Set([...dropped, ...d])];
          ({ error } = await supabase.from('tmk_shirt_catalog').upsert(row2, { onConflict: 'id' }));
        }
        if (!error) { toast('บันทึกแล้ว — แต่ ' + dropped.join(' + ') + ' ยังไม่เก็บ (รัน migration ก่อน)', 'info'); logCatalogVersion(row); invalidateSaleCache('tmk_shirt_catalog'); setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]); setEdit(null); return; }
      }
      if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast(edit.id ? 'แก้ไขแล้ว' : 'เพิ่มสินค้าแล้ว', 'success');
      logAudit({ action: edit.id ? 'update' : 'create', entityType: 'data', entityName: 'catalog', summary: `${edit.id ? 'แก้ไข' : 'เพิ่ม'}แคตตาล็อก ${row.code || row.name}` });
      logCatalogVersion(row);   // 10D — snapshot เวอร์ชัน (fire-and-forget, เงียบถ้าตารางยังไม่มี)
      // อัปเดต state in-place + invalidate cache — ไม่ refetch ทั้งชุดทุกครั้งที่แก้เสื้อ 1 ตัว (ลด egress)
      invalidateSaleCache('tmk_shirt_catalog');
      setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]);
      setEdit(null);
    } catch (e) {
      toast('บันทึกไม่สำเร็จ: ' + (e?.message || 'เชื่อมต่อฐานข้อมูลไม่ได้'), 'error');
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from('tmk_shirt_catalog').delete().eq('id', delTarget.id);
    if (error) { toast('ลบไม่สำเร็จ', 'error'); return; }
    toast('ลบแล้ว', 'success');
    logAudit({ action: 'delete', entityType: 'data', entityName: 'catalog', summary: `ลบแคตตาล็อก ${delTarget.code || delTarget.name}` });
    invalidateSaleCache('tmk_shirt_catalog');
    setItems(prev => (prev || []).filter(x => x.id !== delTarget.id));
    setDelTarget(null); setEdit(null);
  };

  // นำเข้า 47 ลายจากตารางลายเสื้อ (golden) — พร้อมรหัส/หมวด/ราคา/สี/ไซซ์ · ข้ามลายที่มีแล้ว
  const importLegacy = async () => {
    setAskImport(false); setImporting(true);
    const existing = new Set((items || []).map(i => (i.name || '').trim().toLowerCase()));
    const rows = GOLDEN_DESIGNS
      .filter(d => !existing.has((d.name || '').trim().toLowerCase()))
      .map(d => ({ id: uid(), code: d.code || '', name: d.name || '', type: d.type || '', price: d.price || 0, price_wholesale: 0, colors: (d.colors || []).join(', '), sizes: (d.sizes || []).join(', '), status: 'พร้อมขาย', note: '', updated_at: new Date().toISOString() }));
    if (!rows.length) { setImporting(false); toast('มีครบแล้ว ไม่มีลายใหม่ให้นำเข้า', 'info'); return; }
    let ok = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from('tmk_shirt_catalog').insert(chunk);
      if (error) {
        // chunk พังกลางคัน → บอกจำนวนที่ลงจริง + reload ให้ items สะท้อนของที่ลงแล้ว (retry จะข้ามลายเดิม ไม่ dup)
        toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : `นำเข้าได้ ${ok} ลาย แล้วหยุด: ${error.message}`, 'error');
        setImporting(false);
        if (ok > 0) { invalidateSaleCache('tmk_shirt_catalog'); load(true); }
        return;
      }
      ok += chunk.length;
    }
    setImporting(false); toast(`นำเข้า ${ok} ลายแล้ว — แก้ไขเติมราคา/สี/ไซซ์ได้เลย`, 'success');
    logAudit({ action: 'create', entityType: 'data', entityName: 'catalog', summary: `นำเข้าลายเสื้อจากตาราง ${ok} ลาย` });
    invalidateSaleCache('tmk_shirt_catalog'); load(true);
  };

  const showSkel = useDelayedFlag(items === null, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CatalogSkeleton />;
  if (items === null) return null;

  const empty = items.length === 0;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_shirt_catalog</code> — รัน <code>supabase/migrations/20260624-shirt-catalog.sql</code> ใน Supabase ก่อนจึงจะเพิ่ม/บันทึกได้</Card>}

      <Card className="p-[22px]">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3 className="m-0 text-base font-bold leading-tight" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>สินค้า</h3>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[240px]" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 flex-none">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            <Button size="sm" className="flex-none" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มสินค้า</Button>
          </div>
        </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
              <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="หมวด" options={types} value={typeF} onChange={setTypeF} />
              <MultiSelect label="สถานะ" options={STATUSES} value={statusF} onChange={setStatusF} />
              <MultiSelect label="งาน" options={JOB_TYPES} value={jobF} onChange={setJobF} />
              <MultiSelect label="กลุ่มเสื้อ" options={SHIRT_CLASSES} value={classF} onChange={setClassF} />
              {stockByCode.size > 0 && <MultiSelect label="สต็อก" options={['ใกล้หมด', 'หมดสต็อก']} value={stockF} onChange={setStockF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {empty ? (
          <div className="mt-4 p-10" style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีสินค้า — เพิ่มเองหรือดึง 47 ลายมาตรฐานมาใส่ก่อนก็ได้ (พร้อมสี/ไซซ์/ราคา)</div>
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <Button variant="outline" onClick={() => setAskImport(true)} disabled={importing}><Icon name="external" /> นำเข้าลายเสื้อ (47 ลาย)</Button>
              <Button onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มสินค้า</Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 p-8" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>ไม่พบรายการที่ค้น</div>
        ) : (
          <div className="mt-4">
          <SortableTable cards density="cozy" initial={{ key: 'code', dir: 'asc' }}
            columns={[
              { key: 'code', label: 'รหัส', accessor: it => it.code || '' },
              { key: 'name', label: 'ชื่อลาย', accessor: it => it.name || '' },
              { key: 'type', label: 'หมวด', accessor: it => it.type || '' },
              { key: 'price', label: 'ราคาปลีก', align: 'right', accessor: it => Number(it.price) || 0 },
              { key: 'colors', label: 'สี', sortable: false },
              { key: 'sizes', label: 'ไซซ์', accessor: it => it.sizes || '' },
              { key: 'status', label: 'สถานะ', accessor: it => it.status || 'พร้อมขาย' },
              { key: 'act', label: '', sortable: false },
            ]}
            rows={filtered}
            renderRow={it => {
              const miss = missingOf(it);
              return (
                <TableRow key={it.id} onClick={() => setEdit(toForm(it))} style={{ cursor: 'pointer' }}>
                  <TableCell className="num" style={{ whiteSpace: 'nowrap' }}>{it.code || '—'}</TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{it.name || '—'}{stockBadge(it.code)}{it.job_type && it.job_type !== 'ปลีก' && <Badge variant="secondary" className="ml-1.5 rounded-full text-[10px] font-semibold align-middle">{it.job_type}</Badge>}</TableCell>
                  <TableCell className="cap">{it.type || '—'}</TableCell>
                  <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(it.price)}</TableCell>
                  <TableCell><ColorDots colors={it.colors} /></TableCell>
                  <TableCell className="cap" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sizes || '—'}</TableCell>
                  <TableCell><div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><Badge variant="outline" style={{ fontSize: 10, color: statusTone(it.status), fontWeight: 700 }}>{it.status || 'พร้อมขาย'}</Badge>{miss.length > 0 && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ขาด {miss.join('/')}</Badge>}</div></TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setDelTarget(it); }} title="ลบ"><Icon name="trash" /></Button></TableCell>
                </TableRow>
              );
            }} />
          </div>
        )}
      </Card>

      {/* ---------- เพิ่ม/แก้ไข ---------- */}
      {edit && (
        <SideSheet size="lg" icon="bag" title={edit.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} sub="กรอกเฉพาะข้อมูล — ไม่ต้องใส่รูป" onClose={() => setEdit(null)}
          footer={<div className="row between" style={{ width: '100%' }}>
            {edit.id ? <Button variant="outline" size="sm" className="text-[var(--bad)]" onClick={() => { setDelTarget(edit); setEdit(null); }}><Icon name="trash" /> ลบ</Button> : <span />}
            <div className="row" style={{ gap: 8 }}>
              <Button variant="outline" onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button disabled={busy || (!edit.code.trim() && !edit.name.trim()) || Number(edit.price) < 0} title={(!edit.code.trim() && !edit.name.trim()) ? 'ใส่รหัสหรือชื่ออย่างน้อย 1 อย่าง' : undefined} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            </div>
          </div>}>
          <div style={{ display: 'grid', gap: 14 }}>
            {/* ข้อมูลสินค้า */}
            <SecHead>ข้อมูลสินค้า</SecHead>
            <div className="form-grid2">
              <label className="fld"><span>รหัสสินค้า</span><Input value={edit.code} disabled={!!edit.id} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="เช่น JKN111" />{edit.id && <span className="cap" style={{ color: 'var(--ink-4)' }}>🔒 รหัสล็อกไว้ (เป็นกุญแจเชื่อมออเดอร์ทั้งหมด) — ถ้าต้องเปลี่ยนรหัสจริง ให้สร้างลายใหม่</span>}</label>
              <label className="fld"><span>ชื่อลาย / ชื่อเสื้อ</span><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น กนกประยุกต์" />{edit.id && <span className="cap" style={{ color: 'var(--ink-4)' }}>แก้ชื่อได้ — รายงาน/แดชบอร์ด/CRM อัปเดตทันที (ผูกด้วยรหัส)</span>}</label>
              <div className="fld"><span>หมวด</span>
                {addType === null ? (
                  <Select value={edit.type || 'อื่นๆ'} onValueChange={v => { if (v === ADD_TYPE) setAddType(''); else setEdit({ ...edit, type: v }); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([...TYPES, ...types, edit.type].filter(Boolean))].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      <SelectItem value={ADD_TYPE}>➕ เพิ่มหมวดใหม่…</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    <Input autoFocus value={addType} onChange={e => setAddType(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (addType.trim()) setEdit({ ...edit, type: addType.trim() }); setAddType(null); } else if (e.key === 'Escape') { e.preventDefault(); setAddType(null); } }}
                      placeholder="พิมพ์หมวดใหม่" />
                    <Button size="sm" onClick={() => { if (addType.trim()) setEdit({ ...edit, type: addType.trim() }); setAddType(null); }} title="ยืนยัน"><Icon name="check" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setAddType(null)} title="ยกเลิก"><Icon name="x" /></Button>
                  </div>
                )}
              </div>
              <div className="fld"><span>สถานะ</span>
                <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="fld"><span>ประเภทงาน</span>
                <Select value={edit.job_type || 'ปลีก'} onValueChange={v => setEdit({ ...edit, job_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{JOB_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="fld"><span>กลุ่มเสื้อ</span>
                <Select value={edit.shirt_class || 'เสื้อปกติ'} onValueChange={v => setEdit({ ...edit, shirt_class: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIRT_CLASSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <label className="fld"><span>ราคาปลีก (฿)</span><Input type="number" inputMode="decimal" min="0" step="0.01" aria-invalid={Number(edit.price) < 0} value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="0" />{Number(edit.price) < 0 && <span className="field-err">ราคาต้องไม่ติดลบ</span>}</label>
            </div>
            {!edit.code.trim() && !edit.name.trim() && <span className="field-err">ใส่รหัสสินค้าหรือชื่อลายอย่างน้อย 1 อย่าง</span>}

            {/* สี & ไซซ์ */}
            <Separator />
            <SecHead>สี &amp; ไซซ์</SecHead>
            {/* สีที่มี — ชิป Badge แก้รายสี + พาเลตกดเพิ่ม */}
            {(() => {
              const colorList = splitList(edit.colors);
              const setColors = (arr) => setEdit({ ...edit, colors: [...new Set(arr)].join(', ') });
              return (
                <div className="fld">
                  <span>สีที่มี ({colorList.length})</span>
                  {/* ข้างนอก = เฉพาะสีที่เลือก (ชิปถอดได้) · เพิ่มสีผ่าน dropdown */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {colorList.map(c => (
                      <Badge key={c} variant="secondary" className="gap-1.5 rounded-full py-1 pl-2 pr-1 font-normal">
                        <span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c}
                        <button type="button" aria-label={`ลบ ${c}`} className="ml-0.5 inline-flex rounded-full p-0.5 text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--bad)]" onClick={() => setColors(colorList.filter(x => x !== c))}><Icon name="x" /></button>
                      </Badge>
                    ))}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 font-normal border-dashed"><Icon name="plus" /> เพิ่มสี</Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {STD_COLORS.filter(c => !colorList.includes(c)).map(c => <Button type="button" key={c} variant="outline" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 font-normal" onClick={() => setColors([...colorList, c])}><span className="sw" style={{ background: COLOR_HEX[c] }} />{c}</Button>)}
                        </div>
                        <Input className="h-7 mt-2" placeholder="+ สีอื่น (พิมพ์แล้วกด Enter)" onKeyDown={e => { const v = e.target.value.trim(); if (e.key === 'Enter' && v) { e.preventDefault(); setColors([...colorList, v]); e.target.value = ''; } }} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })()}

            {/* ไซซ์ที่มี — toggle */}
            {(() => {
              const sizeList = splitList(edit.sizes);
              const setSizes = (arr) => setEdit({ ...edit, sizes: [...new Set(arr)].sort((a, b) => sizeRank(a) - sizeRank(b)).join(', ') });
              return (
                <div className="fld">
                  <span>ไซซ์ที่มี ({sizeList.length}) — กดเลือก</span>
                  <div className="chip-add">
                    {STD_SIZES.map(s => { const on = sizeList.includes(s); return <Toggle type="button" key={s} variant="pill" size="sm" pressed={on} onPressedChange={() => setSizes(on ? sizeList.filter(x => x !== s) : [...sizeList, s])}>{s}</Toggle>; })}
                    <Input className="h-7 w-24" placeholder="+ อื่น ↵" onKeyDown={e => { const v = e.target.value.trim().toUpperCase(); if (e.key === 'Enter' && v) { e.preventDefault(); setSizes([...sizeList, v]); e.target.value = ''; } }} />
                  </div>
                </div>
              );
            })()}

            {/* รหัสสินค้า (SKU) — สี × ไซซ์ · พับไว้ (เปิดเมื่อต้องแก้รหัสรายตัว) */}
            <Separator />
            <Collapsible open={skuOpen} onOpenChange={setSkuOpen}>
              <CollapsibleTrigger asChild>
                <button type="button" className="row between" style={{ width: '100%', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  <SecHead>รหัสสินค้า (SKU) <span className="cap" style={{ color: 'var(--ink-4)' }}>({(splitList(edit.colors).length || 1) * (splitList(edit.sizes).length || 1)} แบบ — สร้างอัตโนมัติจากสี×ไซซ์)</span></SecHead>
                  <span style={{ display: 'inline-flex', color: 'var(--ink-4)', transition: 'transform .15s', transform: skuOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevD" /></span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
            {(() => {
              const cs = splitList(edit.colors), ss = splitList(edit.sizes), base = (edit.code || '').trim();
              if (!base) return <div className="cap" style={{ color: 'var(--ink-4)' }}>ใส่ <b>รหัสสินค้า</b> ด้านบน เพื่อสร้างรหัสรายสี/ไซซ์อัตโนมัติ</div>;
              const cols = cs.length ? cs : [null], szs = ss.length ? ss : [null];
              const vmap = edit.variants || {};
              const vkey = (c, s) => `${c || ''}|${s || ''}`;
              const formula = (c, s) => [base, c ? (COLOR_TH2CODE[c] || c) : null, s].filter(Boolean).join('-');
              const codeOf = (c, s) => { const o = vmap[vkey(c, s)]; return (o != null && o !== '') ? o : formula(c, s); };
              const setCode = (c, s, val) => { const k = vkey(c, s), v = { ...vmap }, def = formula(c, s); const t = val.trim(); if (!t || t === def) delete v[k]; else v[k] = t; setEdit({ ...edit, variants: v }); };
              const resetAll = () => setEdit({ ...edit, variants: {} });
              const overrideN = Object.keys(vmap).length;
              const all = []; cols.forEach(c => szs.forEach(s => all.push(codeOf(c, s))));
              return (
                <div className="fld">
                  <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span>ทั้งหมด {all.length} แบบ{overrideN ? <span className="cap" style={{ color: 'var(--accent)' }}> · แก้เอง {overrideN}</span> : ''}</span>
                    <div className="row" style={{ gap: 6 }}>
                      {overrideN > 0 && <Button variant="outline" size="sm" onClick={resetAll} title="คืนทุกรหัสเป็นสูตร"><Icon name="refresh" /> รีเซ็ตสูตร</Button>}
                      <Button variant="outline" size="sm" onClick={() => { try { navigator.clipboard.writeText(all.join('\n')); toast(`คัดลอก ${all.length} รหัสแล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } }}><Icon name="layers" /> คัดลอก</Button>
                    </div>
                  </div>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>แก้รหัสในช่องได้เลย — ตัวที่แก้จะมีกรอบสี ตัวที่ไม่แก้ปรับตามรหัส/สี/ไซซ์ให้อัตโนมัติ</div>
                  <div className="sku-table-wrap">
                    <Table className="sku-table"><TableBody>
                      {cols.map(c => (
                        <TableRow key={c || '_'}>
                          <TableCell className="sku-color">{c ? <><span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c} <span className="cap" style={{ color: 'var(--ink-4)' }}>{COLOR_TH2CODE[c] || '?'}</span></> : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่ระบุสี</span>}</TableCell>
                          <TableCell><div className="sku-codes">{szs.map(s => { const ov = vmap[vkey(c, s)] != null && vmap[vkey(c, s)] !== ''; return <input key={s || '_'} className={'sku-input' + (ov ? ' edited' : '')} value={codeOf(c, s)} title={s ? `ไซซ์ ${s}` : ''} onChange={e => setCode(c, s, e.target.value)} />; })}</div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody></Table>
                  </div>
                </div>
              );
            })()}
              </CollapsibleContent>
            </Collapsible>

            {/* รายละเอียด / โน้ต */}
            <Separator />
            <SecHead>รายละเอียด / โน้ต</SecHead>
            <label className="fld"><Textarea rows={3} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="เนื้อผ้า / รายละเอียดเพิ่มเติม" /></label>

            {/* 10D — ประวัติการแก้ไข (เฉพาะตอนแก้ของเดิม · ซ่อนเงียบถ้ายังไม่มีประวัติ) */}
            {edit.id && <CatalogHistory catalogId={edit.id} />}
          </div>
        </SideSheet>
      )}

      {/* ---------- ยืนยันลบ ---------- */}
      {delTarget && (
        <Modal icon="trash" title="ลบสินค้าออกจากรายการ?" onClose={() => setDelTarget(null)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><Button variant="outline" onClick={() => setDelTarget(null)}>ยกเลิก</Button><Button style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={del}>ลบ</Button></div>}>
          <div>ลบ "<b>{delTarget.name || delTarget.code || 'รายการนี้'}</b>" ออกจากแคตตาล็อก? — ย้อนกลับไม่ได้</div>
        </Modal>
      )}

      {/* ---------- ยืนยันนำเข้า 47 ลาย ---------- */}
      {askImport && (
        <Modal icon="external" title="นำเข้าลายเสื้อ 47 ลาย?" onClose={() => setAskImport(false)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><Button variant="outline" onClick={() => setAskImport(false)}>ยกเลิก</Button><Button onClick={importLegacy}>นำเข้าเลย</Button></div>}>
          <div>ดึง 47 ลายจากตารางลายเสื้อ (รหัส · ชื่อลาย · หมวด · ราคา · สีที่มี · ไซซ์ที่มี) มาใส่ <b>ข้ามลายที่มีอยู่แล้ว</b> — จากนั้นเติมรูป/ราคาที่ว่างได้เลย</div>
        </Modal>
      )}
    </div>
  );
}
