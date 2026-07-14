/* ============================================================
   saleImportHub.jsx — การ์ดนำเข้าไฟล์มาร์เก็ตเพลส (Shopee/TikTok)
   (PART 81.6: ลบการ์ด "รวมชื่อเซลล์" — ใช้ SellerCombobox เลือกชื่อตรงตอนกรอกแทน
    · logic รวม alias เดิมใน dashboard คงไว้ให้ tmk_sales_aliases ที่มีอยู่ยังทำงาน)
   ============================================================ */
import { useState, useEffect } from 'react';
import { N, Icon, CardHead } from './components.jsx';
import { MpImportModal } from './modals-import.jsx';
import { cachedFetchAll, clearSaleCache, ORDERS_SEL } from './lib/saleData.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const fetchAllOrders = () => cachedFetchAll('tmk_mp_orders', ORDERS_SEL);

// การ์ดนำเข้าไฟล์มาร์เก็ตเพลส (คืน Card ใบเดียว — ให้ HealthHub วางในกริดของตัวเอง)
export function ImportExportHub() {
  const [orders, setOrders] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { (async () => { const r = await fetchAllOrders(); if (!r.error) setOrders(r.data); })(); }, [reloadKey]);

  return (
    <Card className="p-4">
      <CardHead icon="box" title={<>นำเข้าข้อมูลมาร์เก็ตเพลส <span className="dim">(Shopee / TikTok)</span></>}
        sub={<>ลากไฟล์ Shopee/TikTok เข้าระบบ — รวม / จับคู่ลาย / บันทึกอัตโนมัติในครั้งเดียว · <b>ยอด Shipnity ส่งผ่านแท็บ "ส่งยอดใบเสร็จ"</b></>} />
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์มาร์เก็ตเพลส</Button>
        {orders ? <Badge variant="secondary">ในระบบ {N(orders.length)} ออเดอร์</Badge> : <span className="cap" style={{ color: 'var(--ink-4)' }}>กำลังโหลด…</span>}
      </div>
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </Card>
  );
}
