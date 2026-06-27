/* ============================================================
   saleCatalog.jsx — แคตตาล็อกเสื้อ (Sale → แคตตาล็อกเสื้อ) → tmk_shirt_catalog
   เพิ่ม/แก้/ลบได้ทุกฟิลด์ · ไม่ต้องแนบไฟล์ (รูป optional) · สลับการ์ด/ตาราง
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, invalidateSaleCache } from './lib/saleData.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag, readImageCompressed, stockMeta } from './components.jsx';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { Modal, SideSheet } from './modals.jsx';
import { logAudit } from './lib/audit.js';
import { logCatalogVersion, fetchCatalogVersions } from './lib/catalogVersions.js';
import { GOLDEN_DESIGNS, COLOR_TH2CODE } from './lib/shirtCatalog.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { SearchInput } from '@/components/ui/search-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { SortableTable, DensityToggle } from './components/DataTableParts.jsx';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toast = (m, t) => window.__toast && window.__toast(m, t);
const uid = () => 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const normCode = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');   // จับคู่ catalog.code ↔ products.sku

// คอลัมน์ที่ list/การ์ด/ตารางใช้จริง (เลิก select '*') — image/images เป็น URL สั้นหลังย้าย Storage
const CATALOG_SEL = 'id,code,name,type,price,price_wholesale,cost,colors,sizes,status,job_type,shirt_class,image,images,note,variants,updated_at';
const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:');   // ยังไม่ได้ย้ายขึ้น Storage

// อัปโหลดรูป (data-URL ที่ย่อแล้ว) ขึ้น Supabase Storage bucket tmk-images → คืน public URL
// ลด egress: DB เก็บ URL สั้นแทน base64 ก้อนใหญ่ · upload พัง/bucket หาย → fallback คืน data-URL เดิม (ไม่บล็อกฟอร์ม)
async function uploadCatalogImage(dataUrl, catalogId, idx) {
  if (!isDataUrl(dataUrl)) return dataUrl;   // เป็น URL อยู่แล้ว — ไม่ต้องอัปซ้ำ (idempotent)
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `catalog/${catalogId}-${idx}-${Date.now().toString(36)}.jpg`;
    const { error } = await supabase.storage.from('tmk-images')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (error) throw error;
    const { data: pub } = supabase.storage.from('tmk-images').getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.warn('catalog image upload → ใช้ data-URL แทน:', e?.message);
    return dataUrl;
  }
}

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
const blank = () => ({ code: '', name: '', type: 'เสื้อโปโล', price: '', price_wholesale: '', cost: '', colors: '', sizes: '', status: 'พร้อมขาย', job_type: 'ปลีก', shirt_class: 'เสื้อปกติ', image: '', images: [], note: '', variants: {} });
const MAX_IMAGES = 8;
// variants อาจมาเป็น object (jsonb) หรือ string → คืน object เสมอ
const parseVariants = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
// แปลง row จาก DB → form (numeric เป็น string ในช่องกรอก)
const toForm = (it) => ({ ...blank(), ...it, price: it.price ?? '', price_wholesale: it.price_wholesale ?? '', cost: it.cost ?? '', variants: parseVariants(it.variants), images: Array.isArray(it.images) ? it.images : (it.image ? [it.image] : []) });

// พาเลตสี/ไซซ์มาตรฐาน + ตัวช่วยแก้ไขแบบชิป
const COLOR_HEX = { 'ขาว':'#ffffff','ดำ':'#1a1a1a','กรม':'#1f2d50','กรมท่า':'#1f2d50','ฟ้า':'#4a8be0','น้ำเงิน':'#1f3aa0','เขียว':'#2f9e6e','เหลือง':'#e8c23b','แดง':'#c0392b','ชมพู':'#e06aa0','ม่วง':'#6b5ce0','ส้ม':'#e0772f','โอรส':'#e0772f','ครีม':'#efe7d2' };
const STD_COLORS = Object.keys(COLOR_TH2CODE);
const STD_SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL'];
const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const sizeRank = (s) => { const i = STD_SIZES.indexOf(s); return i < 0 ? 99 : i; };
const qualityBadges = (it) => {
  const out = [];
  if (!it.image) out.push(['warn', 'ไม่มีรูป']);
  if (!(Number(it.price) > 0)) out.push(['warn', 'ยังไม่ตั้งราคา']);
  if (!splitList(it.colors).length) out.push(['warn', 'ไม่มีสี']);
  if (!splitList(it.sizes).length) out.push(['warn', 'ไม่มีไซซ์']);
  if (!out.length) out.push(['good', 'ข้อมูลครบ']);
  return out;
};
function CatalogThumb({ item, small = false }) {
  if (item?.image) return <img src={item.image} alt={item.name || ''} loading="lazy" style={small ? { width: 34, height: 34, borderRadius: 'var(--r-xs)', objectFit: 'cover', display: 'block' } : undefined} />;
  if (small) return <span className="catalog-thumb-ph sm"><Icon name="bag" /></span>;
  return (
    <>
      <div className="catalog-pattern" />
      <div className="catalog-thumb-code">
        <b>{item?.code || 'TMK'}</b>
        <span className="cap">{item?.type || 'Catalog'}</span>
      </div>
    </>
  );
}
// รวมรูปทั้งหมดของเสื้อ (รองรับ DB เก่าที่มีแค่ image เดี่ยว)
const itemImages = (it) => (Array.isArray(it?.images) && it.images.length ? it.images : (it?.image ? [it.image] : []));
// thumb การ์ด: รูปเดียว → CatalogThumb เดิม · หลายรูป → carousel ปัด/จุด/ลูกศร (instantiate embla เฉพาะตอน >1)
function CatalogCardThumb({ item }) {
  const imgs = itemImages(item);
  const [api, setApi] = useState(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    if (!api) return;
    const onSel = () => setSel(api.selectedScrollSnap());
    onSel(); api.on('select', onSel); api.on('reInit', onSel);
    return () => { api.off('select', onSel); api.off('reInit', onSel); };
  }, [api]);
  if (imgs.length <= 1) return <div className="catalog-thumb"><CatalogThumb item={item} /></div>;
  // คลิกปุ่ม (ลูกศร/จุด) ไม่ให้ทะลุไปเปิดฟอร์มแก้ไข — ปล่อย handler ของปุ่มทำงานก่อน แล้วหยุด bubble ที่ชั้นนี้
  const blockBtn = (e) => { if (e.target.closest('button')) e.stopPropagation(); };
  return (
    <div className="catalog-thumb catalog-thumb-carousel" onClick={blockBtn}>
      <Carousel opts={{ loop: true }} setApi={setApi} className="h-full w-full">
        <CarouselContent className="h-full ml-0">
          {imgs.map((src, i) => (
            <CarouselItem key={i} className="pl-0 h-full">
              <img src={src} alt={`${item?.name || ''} ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="catalog-carousel-arrow left-2" />
        <CarouselNext className="catalog-carousel-arrow right-2" />
      </Carousel>
      <div className="catalog-carousel-dots">
        {imgs.map((_, i) => (
          <button key={i} type="button" className={i === sel ? 'on' : ''} aria-label={`รูป ${i + 1}`}
            onClick={() => { api && api.scrollTo(i); }} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Skeleton ---------- */
function CatalogSkeleton({ view }) {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-[22px]">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={16} /><div className="row" style={{ gap: 8 }}><Skel w={70} h={30} r={8} /><Skel w={110} h={30} r={8} /></div></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 8 }).map((_, i) => <Skel key={i} w={i % 2 ? 78 : 56} h={26} r={8} />)}</div>
      </Card>
      {view === 'table'
        ? <Card className="p-[22px]"><SkelTable cols={8} rows={9} /></Card>
        : <div className="catalog-grid">{Array.from({ length: 10 }).map((_, i) => <Card key={i} style={{ overflow: 'hidden' }}><Skel w="100%" h={150} r={0} /><div style={{ padding: 12 }}><Skel w="40%" h={9} /><Skel w="80%" h={14} style={{ marginTop: 8 }} /><Skel w="55%" h={11} style={{ marginTop: 10 }} /></div></Card>)}</div>}
    </div>
  );
}

export function ShirtCatalogView() {
  const [items, setItems] = useState(null);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState(() => localStorage.getItem('tmk_catalog_view') || 'card');
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = usePersistedState('tmk-catalog-typeF', []);
  const [statusF, setStatusF] = usePersistedState('tmk-catalog-statusF', []);
  const [jobF, setJobF] = usePersistedState('tmk-catalog-jobF', []);
  const [classF, setClassF] = usePersistedState('tmk-catalog-classF', []);
  const [stockF, setStockF] = usePersistedState('tmk-catalog-stockF', []);   // 10A — กรองสถานะสต็อก
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [edit, setEdit] = useState(null);      // form object หรือ null
  const [addType, setAddType] = useState(null); // string|null — โหมดพิมพ์หมวดใหม่ใน Select หมวด
  const [dragImg, setDragImg] = useState(null);  // index รูปที่กำลังลากจัดลำดับ
  const [busy, setBusy] = useState(false);
  const [catDensity, setCatDensity] = usePersistedState('tmk-catalog-density', 'cozy');
  const [delTarget, setDelTarget] = useState(null);
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
  const [backfill, setBackfill] = useState(null);   // null=ไม่ทำ · {done,total} ระหว่างย้ายรูปขึ้น Storage

  // เรียงล่าสุดก่อน (cachedFetchAll ไม่ได้ order ฝั่ง server → sort ฝั่ง client)
  const sortByUpdated = (rows) => [...rows].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const load = async (force = false) => {
    // ใช้ cache กลาง (TTL 5นาที + dedup) — สลับหน้าออก/เข้าไม่ดึงซ้ำ · narrow คอลัมน์ (ไม่ดึง base64 ก้อนใหญ่)
    let r = await cachedFetchAll('tmk_shirt_catalog', CATALOG_SEL, force);
    // graceful: คอลัมน์ใหม่ (job_type/shirt_class/images) ยังไม่ถูก migrate → fallback select('*')
    if (r.error && /column|does not exist|job_type|shirt_class|images/i.test(r.error.message || '')) {
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
  useEffect(() => { if (!edit) setAddType(null); }, [edit]);   // ปิดชีต/เปลี่ยนรายการ → ออกจากโหมดพิมพ์หมวดใหม่

  const setViewP = (v) => { setView(v); try { localStorage.setItem('tmk_catalog_view', v); } catch {/* noop */} };

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
      price: Number(edit.price) || 0, price_wholesale: Number(edit.price_wholesale) || 0, cost: Number(edit.cost) || 0,
      colors: (edit.colors || '').trim(), sizes: (edit.sizes || '').trim(), status: edit.status || 'พร้อมขาย',
      job_type: edit.job_type || 'ปลีก',
      shirt_class: edit.shirt_class || 'เสื้อปกติ',
      image: (edit.images && edit.images[0]) || edit.image || '', images: edit.images || [], note: (edit.note || '').trim(), variants: edit.variants || {}, updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from('tmk_shirt_catalog').upsert(row, { onConflict: 'id' });
    // ยังไม่ได้รัน migration variants/job_type/shirt_class/images → ตัดคอลัมน์ที่ DB ยังไม่มีออก แล้วบันทึกส่วนที่เหลือ
    if (error && /variants|job_type|shirt_class|images/i.test(error.message)) {
      const row2 = { ...row };
      const dropCol = (re, col, label) => { if (re.test(error.message) && row2[col] !== undefined) { delete row2[col]; return label; } return null; };
      let dropped = [];
      // ตัดทุกคอลัมน์ที่ error ชี้ในรอบเดียว แล้วลองซ้ำ จนกว่าจะไม่มี error คอลัมน์ค้าง
      for (let pass = 0; pass < 4 && error && /variants|job_type|shirt_class|images/i.test(error.message); pass++) {
        const d = [
          dropCol(/variants/i, 'variants', 'รหัสรายตัว (variants)'),
          dropCol(/job_type/i, 'job_type', 'ประเภทงาน (job_type)'),
          dropCol(/shirt_class/i, 'shirt_class', 'กลุ่มเสื้อ (shirt_class)'),
          dropCol(/images/i, 'images', 'หลายรูป (images)'),
        ].filter(Boolean);
        dropped = [...new Set([...dropped, ...d])];
        ({ error } = await supabase.from('tmk_shirt_catalog').upsert(row2, { onConflict: 'id' }));
      }
      if (!error) { setBusy(false); toast('บันทึกแล้ว — แต่ ' + dropped.join(' + ') + ' ยังไม่เก็บ (รัน migration ก่อน)', 'info'); logCatalogVersion(row); invalidateSaleCache('tmk_shirt_catalog'); setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]); setEdit(null); return; }
    }
    setBusy(false);
    if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    toast(edit.id ? 'แก้ไขแล้ว' : 'เพิ่มเสื้อแล้ว', 'success');
    logAudit({ action: edit.id ? 'update' : 'create', entityType: 'data', entityName: 'catalog', summary: `${edit.id ? 'แก้ไข' : 'เพิ่ม'}แคตตาล็อก ${row.code || row.name}` });
    logCatalogVersion(row);   // 10D — snapshot เวอร์ชัน (fire-and-forget, เงียบถ้าตารางยังไม่มี)
    // อัปเดต state in-place + invalidate cache — ไม่ refetch ทั้งชุดทุกครั้งที่แก้เสื้อ 1 ตัว (ลด egress)
    invalidateSaleCache('tmk_shirt_catalog');
    setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]);
    setEdit(null);
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
      .map(d => ({ id: uid(), code: d.code || '', name: d.name || '', type: d.type || '', price: d.price || 0, price_wholesale: 0, cost: 0, colors: (d.colors || []).join(', '), sizes: (d.sizes || []).join(', '), status: 'พร้อมขาย', image: '', note: '', updated_at: new Date().toISOString() }));
    if (!rows.length) { setImporting(false); toast('มีครบแล้ว ไม่มีลายใหม่ให้นำเข้า', 'info'); return; }
    let ok = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from('tmk_shirt_catalog').insert(chunk);
      if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'นำเข้าไม่สำเร็จ: ' + error.message, 'error'); setImporting(false); return; }
      ok += chunk.length;
    }
    setImporting(false); toast(`นำเข้า ${ok} ลายแล้ว — แก้ไขเติมรูป/ราคาได้เลย`, 'success');
    logAudit({ action: 'create', entityType: 'data', entityName: 'catalog', summary: `นำเข้าลายเสื้อจากตาราง ${ok} ลาย` });
    invalidateSaleCache('tmk_shirt_catalog'); load(true);
  };

  // เพิ่มได้หลายรูป — บีบอัดทีละไฟล์, ต่อท้าย, เคารพ cap MAX_IMAGES
  const onImages = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const cur = (edit?.images || []).slice();
    const room = MAX_IMAGES - cur.length;
    if (room <= 0) { toast(`ใส่ได้สูงสุด ${MAX_IMAGES} รูป`, 'info'); return; }
    const take = files.slice(0, room);
    const cid = edit?.id || ('new-' + Date.now().toString(36));   // ใหม่ยังไม่มี id → temp (path ยังไม่ซ้ำเพราะมี ts)
    try {
      const urls = [];
      for (let i = 0; i < take.length; i++) {
        const dataUrl = await readImageCompressed(take[i], 640, 0.82);
        urls.push(await uploadCatalogImage(dataUrl, cid, cur.length + i));   // → Storage URL (fallback data-URL)
      }
      setEdit(e => ({ ...e, images: [...(e.images || []), ...urls] }));
      if (files.length > room) toast(`ใส่ได้สูงสุด ${MAX_IMAGES} รูป — เพิ่มแค่ ${room} รูปแรก`, 'info');
    } catch (e) { toast(e.message || 'อ่านรูปไม่ได้', 'error'); }
  };

  // จำนวนเสื้อที่ยังมีรูป base64 (data:) ค้างใน DB — ปุ่ม backfill โผล่เมื่อ > 0
  const needsBackfill = (it) => isDataUrl(it?.image) || (Array.isArray(it?.images) && it.images.some(isDataUrl));
  const pendingBackfill = useMemo(() => (items || []).filter(needsBackfill), [items]);

  // ย้ายรูปเก่า (base64 ใน DB) ขึ้น Storage ทีละรายการ — idempotent (ข้ามที่เป็น URL แล้ว), กัน rate-limit
  const runBackfill = async () => {
    const targets = pendingBackfill;
    if (!targets.length) { toast('ไม่มีรูปเก่าให้ย้าย — เป็น Storage หมดแล้ว', 'info'); return; }
    setBackfill({ done: 0, total: targets.length });
    let okRows = 0, okImgs = 0;
    for (let t = 0; t < targets.length; t++) {
      const it = targets[t];
      const src = (Array.isArray(it.images) && it.images.length) ? it.images : (it.image ? [it.image] : []);
      const next = [];
      for (let i = 0; i < src.length; i++) {
        if (isDataUrl(src[i])) { const url = await uploadCatalogImage(src[i], it.id, i); next.push(url); if (!isDataUrl(url)) okImgs++; }
        else next.push(src[i]);
      }
      const patch = { images: next, image: next[0] || '', updated_at: new Date().toISOString() };
      let { error } = await supabase.from('tmk_shirt_catalog').update(patch).eq('id', it.id);
      if (error && /images/i.test(error.message || '')) {   // คอลัมน์ images ยังไม่มี → เซฟแค่รูปปก
        ({ error } = await supabase.from('tmk_shirt_catalog').update({ image: next[0] || '', updated_at: patch.updated_at }).eq('id', it.id));
      }
      if (!error) { okRows++; setItems(prev => (prev || []).map(x => x.id === it.id ? { ...x, ...patch } : x)); }
      setBackfill({ done: t + 1, total: targets.length });
    }
    invalidateSaleCache('tmk_shirt_catalog');
    setBackfill(null);
    logAudit({ action: 'update', entityType: 'data', entityName: 'catalog', summary: `ย้ายรูปขึ้น Storage ${okRows} รายการ / ${okImgs} รูป` });
    toast(`ย้ายขึ้น Storage แล้ว ${okRows} รายการ / ${okImgs} รูป`, 'success');
  };
  // ตัวช่วยจัดการรูปในฟอร์ม
  const removeImage = (i) => setEdit(e => ({ ...e, images: (e.images || []).filter((_, j) => j !== i) }));
  const setCover = (i) => setEdit(e => { const a = (e.images || []).slice(); if (i <= 0 || i >= a.length) return e; const [m] = a.splice(i, 1); a.unshift(m); return { ...e, images: a }; });
  const moveImage = (i, dir) => setEdit(e => { const a = (e.images || []).slice(); const j = i + dir; if (j < 0 || j >= a.length) return e; [a[i], a[j]] = [a[j], a[i]]; return { ...e, images: a }; });

  const showSkel = useDelayedFlag(items === null, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CatalogSkeleton view={view} />;
  if (items === null) return null;

  const empty = items.length === 0;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_shirt_catalog</code> — รัน <code>supabase/migrations/20260624-shirt-catalog.sql</code> ใน Supabase ก่อนจึงจะเพิ่ม/บันทึกได้</Card>}

      <Card className="p-[22px]">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-none"><Icon name="bag" /></span>
            <div>
              <h3 style={{ margin: 0 }}>แคตตาล็อกเสื้อ</h3>
              <span className="cap" style={{ color: 'var(--ink-4)' }}><b style={{ color: 'var(--ink-2)' }}>{N(filtered.length)}</b> รายการ{filtered.length !== items.length ? ` / ${N(items.length)}` : ''}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setViewP(v === 'card' ? 'card' : 'table')} className="gap-0">
              <ToggleGroupItem value="card" title="การ์ดรูป" className="rounded-r-none"><Icon name="grid" /></ToggleGroupItem>
              <ToggleGroupItem value="table" title="ตาราง" className="-ml-px rounded-l-none"><Icon name="list" /></ToggleGroupItem>
            </ToggleGroup>
            {pendingBackfill.length > 0 && (
              <Button size="sm" variant="outline" disabled={!!backfill} onClick={runBackfill}
                title={`ย้ายรูป base64 ของ ${pendingBackfill.length} รายการขึ้น Supabase Storage (ลด Egress)`}>
                <Icon name="upload" /> {backfill ? `กำลังย้าย ${backfill.done}/${backfill.total}…` : `ย้ายรูปขึ้น Storage (${pendingBackfill.length})`}
              </Button>
            )}
            <Button size="sm" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มเสื้อ</Button>
          </div>
        </div>

        <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา รหัส / ชื่อลาย / หมวด / สี" wrapperClassName="mb-3" />
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {activeChips.length > 0
              ? activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)
              : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้กรอง — แสดงทุกลาย</span>}
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
          </div>
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
      </Card>

      {empty ? (
        <Card className="p-10" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีเสื้อในแคตตาล็อก — เพิ่มเองหรือดึง 47 ลายจากตารางลายเสื้อมาใส่ก่อนก็ได้ (พร้อมสี/ไซซ์/ราคา)</div>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <Button variant="outline" onClick={() => setAskImport(true)} disabled={importing}><Icon name="external" /> นำเข้าลายเสื้อ (47 ลาย)</Button>
            <Button onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มเสื้อ</Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>ไม่พบรายการที่ค้น</Card>
      ) : view === 'card' ? (
        <div className="catalog-grid">
          {filtered.map(it => (
            <Card key={it.id} className="catalog-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setEdit(toForm(it))}>
              <CatalogCardThumb item={it} />
              <CardContent className="p-3">
                <div className="row between" style={{ gap: 6 }}>
                  <span className="cap" style={{ color: 'var(--ink-4)' }}>{it.code || '—'}</span>
                  <div className="row" style={{ gap: 4 }}>{stockBadge(it.code)}<Badge variant="outline" style={{ fontSize: 10, color: statusTone(it.status), fontWeight: 700 }}>{it.status || 'พร้อมขาย'}</Badge></div>
                </div>
                <div style={{ fontWeight: 700, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || '(ไม่มีชื่อ)'}</div>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="cap" style={{ color: 'var(--ink-3)' }}>{it.type || '—'}</span>
                  {it.job_type && it.job_type !== 'ปลีก' && <Badge variant="secondary" className="rounded-full text-[10px] font-semibold">{it.job_type}</Badge>}
                </div>
                <div className="row between" style={{ marginTop: 8, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{baht(it.price)}</span>
                </div>
                {it.colors && <div className="catalog-color-swatches">{splitList(it.colors).slice(0, 8).map(c => <span key={c} className="catalog-color-dot" style={{ background: COLOR_HEX[c] || '#bbb' }} title={c} />)}</div>}
                {it.sizes && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sizes}</div>}
                <div className="quality-row">{qualityBadges(it).slice(0, 2).map(([tone, label]) => <Badge key={label} variant={tone === 'good' ? 'success' : 'warning'} className="rounded-full text-[10px] font-medium">{label}</Badge>)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-[22px]">
          {filtered.length > 0 && <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}><DensityToggle value={catDensity} onChange={setCatDensity} /></div>}
          <SortableTable density={catDensity} initial={{ key: 'code', dir: 'asc' }}
            columns={[
              { key: 'thumb', label: '', sortable: false },
              { key: 'code', label: 'รหัส', accessor: it => it.code || '' },
              { key: 'name', label: 'ชื่อลาย', accessor: it => it.name || '' },
              { key: 'type', label: 'หมวด', accessor: it => it.type || '' },
              { key: 'price', label: 'ปลีก', align: 'right', accessor: it => Number(it.price) || 0 },
              { key: 'colors', label: 'สี', accessor: it => it.colors || '' },
              { key: 'sizes', label: 'ไซซ์', accessor: it => it.sizes || '' },
              { key: 'status', label: 'สถานะ', accessor: it => it.status || 'พร้อมขาย' },
              { key: 'act', label: '', sortable: false },
            ]}
            rows={filtered}
            renderRow={it => (
              <TableRow key={it.id} onClick={() => setEdit(toForm(it))} style={{ cursor: 'pointer' }}>
                <TableCell><CatalogThumb item={it} small /></TableCell>
                <TableCell className="cap">{it.code || '—'}</TableCell>
                <TableCell style={{ fontWeight: 600 }}>{it.name || '—'}{stockBadge(it.code)}</TableCell>
                <TableCell className="cap">{it.type || '—'}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(it.price)}</TableCell>
                <TableCell className="cap">{it.colors || '—'}</TableCell>
                <TableCell className="cap">{it.sizes || '—'}</TableCell>
                <TableCell><div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><Badge variant="outline" style={{ fontSize: 10, color: statusTone(it.status), fontWeight: 700 }}>{it.status || 'พร้อมขาย'}</Badge>{qualityBadges(it).slice(0, 1).map(([tone, label]) => <Badge key={label} variant={tone === 'good' ? 'success' : 'warning'} className="rounded-full text-[10px] font-medium">{label}</Badge>)}</div></TableCell>
                <TableCell><Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); setDelTarget(it); }} title="ลบ"><Icon name="trash" /></Button></TableCell>
              </TableRow>
            )} />
        </Card>
      )}

      {/* ---------- เพิ่ม/แก้ไข ---------- */}
      {edit && (
        <SideSheet size="lg" icon="bag" title={edit.id ? 'แก้ไขเสื้อ' : 'เพิ่มเสื้อ'} sub="แก้ไขได้ทุกฟิลด์ · รูปใส่หรือไม่ใส่ก็ได้" onClose={() => setEdit(null)}
          footer={<div className="row between" style={{ width: '100%' }}>
            {edit.id ? <Button variant="outline" size="sm" className="text-[var(--bad)]" onClick={() => { setDelTarget(edit); setEdit(null); }}><Icon name="trash" /> ลบ</Button> : <span />}
            <div className="row" style={{ gap: 8 }}>
              <Button variant="outline" onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button disabled={busy || (!edit.code.trim() && !edit.name.trim()) || Number(edit.price) < 0 || Number(edit.cost) < 0} title={(!edit.code.trim() && !edit.name.trim()) ? 'ใส่รหัสหรือชื่ออย่างน้อย 1 อย่าง' : undefined} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            </div>
          </div>}>
          <div style={{ display: 'grid', gap: 14 }}>
            {/* รูป (หลายรูปได้ · ลากจัดลำดับ · รูปแรก = ปก) */}
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="row between">
                <span className="cap" style={{ color: 'var(--ink-3)' }}>รูปสินค้า {(edit.images?.length || 0) > 0 && <span style={{ color: 'var(--ink-4)' }}>· {edit.images.length}/{MAX_IMAGES} · รูปแรก = ปก · ลากเพื่อจัดลำดับ</span>}</span>
              </div>
              <div className="catalog-img-grid">
                {(edit.images || []).map((src, i) => (
                  <div key={i} className={`catalog-img-cell${dragImg === i ? ' dragging' : ''}`} draggable
                    onDragStart={() => setDragImg(i)}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); if (dragImg != null && dragImg !== i) setEdit(ed => { const a = (ed.images || []).slice(); const [m] = a.splice(dragImg, 1); a.splice(i, 0, m); return { ...ed, images: a }; }); setDragImg(null); }}
                    onDragEnd={() => setDragImg(null)}>
                    <img src={src} alt={`รูป ${i + 1}`} loading="lazy" />
                    {i === 0 && <span className="catalog-img-cover">ปก</span>}
                    <div className="catalog-img-actions">
                      {i !== 0 && <button type="button" title="ตั้งเป็นปก" onClick={() => setCover(i)}><Icon name="star" /></button>}
                      <button type="button" title="เลื่อนซ้าย" disabled={i === 0} onClick={() => moveImage(i, -1)}><Icon name="chevL" /></button>
                      <button type="button" title="เลื่อนขวา" disabled={i === (edit.images.length - 1)} onClick={() => moveImage(i, 1)}><Icon name="chevR" /></button>
                      <button type="button" title="ลบรูป" className="del" onClick={() => removeImage(i)}><Icon name="x" /></button>
                    </div>
                  </div>
                ))}
                {(edit.images?.length || 0) < MAX_IMAGES && (
                  <label className="catalog-img-add" title="เพิ่มรูป">
                    <Icon name="image" /><span>เพิ่มรูป</span>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { onImages(e.target.files); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>

            {/* ข้อมูลสินค้า */}
            <Separator />
            <SecHead>ข้อมูลสินค้า</SecHead>
            <div className="form-grid2">
              <label className="fld"><span>รหัสสินค้า</span><Input value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="เช่น JKN111" /></label>
              <label className="fld"><span>ชื่อลาย / ชื่อเสื้อ</span><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น กนกประยุกต์" /></label>
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
            </div>
            {!edit.code.trim() && !edit.name.trim() && <span className="field-err">ใส่รหัสสินค้าหรือชื่อลายอย่างน้อย 1 อย่าง</span>}

            {/* ราคา & ต้นทุน */}
            <Separator />
            <SecHead>ราคา &amp; ต้นทุน</SecHead>
            <div className="form-grid2">
              <label className="fld"><span>ราคาปลีก (฿)</span><Input type="number" inputMode="decimal" min="0" step="0.01" aria-invalid={Number(edit.price) < 0} value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="0" />{Number(edit.price) < 0 && <span className="field-err">ราคาต้องไม่ติดลบ</span>}</label>
              <label className="fld"><span>ต้นทุน (฿)</span><Input type="number" inputMode="decimal" min="0" step="0.01" aria-invalid={Number(edit.cost) < 0} value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} placeholder="0" />{Number(edit.cost) < 0 && <span className="field-err">ต้นทุนต้องไม่ติดลบ</span>}</label>
            </div>
            {Number(edit.cost) > 0 && Number(edit.price) > 0 && <div className="cap" style={{ color: 'var(--ink-4)' }}>กำไรปลีก ≈ <b style={{ color: 'var(--good)' }}>{baht(Number(edit.price) - Number(edit.cost))}</b> ({Math.round((1 - Number(edit.cost) / Number(edit.price)) * 100)}%)</div>}

            {/* สี & ไซซ์ */}
            <Separator />
            <SecHead>สี &amp; ไซซ์</SecHead>
            {/* สีที่มี — ชิป Badge แก้รายสี + พาเลตกดเพิ่ม */}
            {(() => {
              const colorList = splitList(edit.colors);
              const setColors = (arr) => setEdit({ ...edit, colors: [...new Set(arr)].join(', ') });
              return (
                <div className="fld">
                  <span>สีที่มี ({colorList.length}) — กดเพิ่ม/ลบได้</span>
                  {colorList.length > 0 && <div className="flex flex-wrap gap-1.5">{colorList.map(c => (
                    <Badge key={c} variant="secondary" className="gap-1.5 rounded-full py-1 pl-2 pr-1 font-normal">
                      <span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c}
                      <button type="button" aria-label={`ลบ ${c}`} className="ml-0.5 inline-flex rounded-full p-0.5 text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--bad)]" onClick={() => setColors(colorList.filter(x => x !== c))}><Icon name="x" /></button>
                    </Badge>
                  ))}</div>}
                  <div className="chip-add">
                    {STD_COLORS.filter(c => !colorList.includes(c)).map(c => <Button type="button" key={c} variant="outline" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 font-normal" onClick={() => setColors([...colorList, c])}><span className="sw" style={{ background: COLOR_HEX[c] }} />{c}</Button>)}
                    <Input className="h-7 w-28" placeholder="+ สีอื่น ↵" onKeyDown={e => { const v = e.target.value.trim(); if (e.key === 'Enter' && v) { e.preventDefault(); setColors([...colorList, v]); e.target.value = ''; } }} />
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

            {/* รหัสสินค้า (SKU) — สี × ไซซ์ · แก้รหัสรายตัวได้ · ตัวที่ไม่แก้ตามสูตร base-โค้ดสี-ไซซ์ */}
            <Separator />
            <SecHead>รหัสสินค้า (SKU)</SecHead>
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
        <Modal icon="trash" title="ลบเสื้อออกจากแคตตาล็อก?" onClose={() => setDelTarget(null)}
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
