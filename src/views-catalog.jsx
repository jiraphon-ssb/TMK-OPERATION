import { SaleDashboard } from './saleDashboard.jsx';
import { CrmView } from './saleCrm.jsx';
import { ShirtCatalogView } from './saleCatalog.jsx';
import { OrdersHub } from './views-orders.jsx';

function ReportHub() {
  return <SaleDashboard />;
}

export function CatalogView({ sub }) {
  if (sub === 'orders') return <OrdersHub />;
  if (sub === 'shirts') return <ShirtCatalogView />;
  if (sub === 'crm') return <CrmView />;
  return <ReportHub />; // เน้น sale — sub 'entry' (บันทึกขาย) ยุบเข้า SaleDataHub (route ที่ App.jsx)
}

