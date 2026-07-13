/* ============================================================
   modals.jsx — barrel re-export (PART 79 · เนื้อแยกไป modals-core/-stock/-{task,catalog,import,order,sale,ads}/LoginScreen)
   คง import path เดิมของทุกไฟล์ที่อ้าง './modals.jsx' · App จะ import ตรงจากไฟล์ย่อย (lazy) แยกต่างหาก
   ============================================================ */
export { Modal, SideSheet, toast, nn, money, bahtStr, DISCARD_MSG, guardClose, uid, saveRow, deleteRow, MD } from './modals-core.jsx';
export { mutateProductRow, mutateProductReservations } from './modals-stock.js';
export { RecordSalesModal, HistoricalEntryModal } from './modals-sale.jsx';
export { TaskModal } from './modals-task.jsx';
export { ProductModal } from './modals-catalog.jsx';
export { MpImportModal } from './modals-import.jsx';
export { OrderModal, advanceOrderStatus } from './modals-order.jsx';
export { CampaignModal, AdCampaignModal, MonthlyTargetModal, CustomerSegmentModal } from './modals-ads.jsx';
export { LoginScreen } from './LoginScreen.jsx';
