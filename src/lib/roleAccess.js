/* ============================================================
   roleAccess.js — ตรรกะสิทธิ์ตาม role (PART 84 TEST-1 · รวมศูนย์ security-critical)
   ============================================================
   pure ล้วน — เดิม inline ซ้ำใน views-orders/views-sale-submit (user?.role === 'admin' ...)
   → รวมเป็น single source ที่เทสต์ได้ (role visibility = security · ต้องมี test)
   นิยาม: admin เห็น "ทั้งทีม" · คนอื่น (editor/viewer) เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมลตัวเอง)
   ============================================================ */

// ผู้ดูแลระบบ?
export const isAdmin = (user) => user?.role === 'admin';

// ชื่อที่ระบุว่า "เป็นของฉัน" — จับคู่กับ salesperson ของออเดอร์ (ชื่อ หรือ อีเมล)
export const myNamesOf = (user) => [user?.name, user?.email].filter(Boolean);

// เห็นข้อมูล "ทั้งทีม" (ใบเสร็จ + คนทัก/funnel) = admin เท่านั้น
export const canSeeTeam = (user) => isAdmin(user);

// ออเดอร์นี้มองเห็นได้โดย user คนนี้ไหม — admin เห็นทุกใบ · คนอื่นเห็นเฉพาะที่ salesperson = ชื่อ/อีเมลตัวเอง
export const orderVisibleTo = (order, user) => isAdmin(user) || myNamesOf(user).includes((order?.salesperson) || '');
