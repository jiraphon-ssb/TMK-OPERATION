# Sale UI Aesthetic + Right-Side Popup Handoff for Claude

วันที่ตรวจ: 2026-06-24  
ขอบเขต: ระบบ `Sale` ทั้งหมดก่อน ไม่รวม `ยอดขาย` เดิม ยกเว้นจุดที่มีผลต่อภาพรวม navigation

## Executive Summary

ระบบ Sale ตอนนี้โครงดีและใช้งานได้จริง แต่ภาพรวมยังให้ความรู้สึกเป็น "dashboard template + table/form" มากกว่าระบบขายที่ polished สำหรับใช้งานทุกวัน จุดที่ควรทำก่อนคือปรับ hierarchy, spacing, visual rhythm, และเปลี่ยน popup งาน Sale จาก centered modal ไปเป็น right-side drawer/sheet ตาม pattern เว็บสมัยใหม่

ข้อเสนอหลัก:

1. ทำ `SideSheet` component ใหม่ แล้ว migrate เฉพาะ popup ของ Sale ก่อน
2. ใช้ centered modal ต่อเฉพาะ confirmation, destructive action, auth/terms, หรือ flow ที่ต้องตัดสินใจสั้น ๆ
3. ปรับทุกหน้า Sale ให้มี visual hierarchy ชัดขึ้น: primary metric, secondary insight, table/action area
4. ทำรายละเอียด/แก้ไข/นำเข้า/ดู drill-down เป็น right-side drawer เพื่อไม่ตัด context ของหน้าปัจจุบัน

## Reference Patterns

ใช้ pattern เหล่านี้เป็น benchmark:

- Ant Design Drawer: drawer ใช้สำหรับข้อมูลหรือ action ที่เลื่อนออกจากด้านข้าง โดยยังรักษา context หน้าเดิมไว้ และเหมาะกับ form/task ที่หนักกว่า popover  
  https://ant.design/components/drawer/
- shadcn/ui Sheet: sheet เป็น surface ที่ complement หน้าหลัก และกำหนด side ได้ เช่น `right`  
  https://ui.shadcn.com/docs/components/sheet
- GitLab Pajamas Drawer: ใช้ drawer เมื่อ primary task ยังอยู่ที่หน้าหลัก แต่ต้องเปิด content รอง/quick view/quick edit ชั่วคราว, default เปิดจากขวา, มี focus trap, Esc close, mobile เต็ม viewport  
  https://design.gitlab.com/components/drawer
- NN/g Bottom Sheet: สำหรับมือถือ bottom sheet เหมาะกับ contextual action สั้น ๆ แต่ไม่ควร stack หลายชั้น และควรมีปุ่ม close ชัด  
  https://www.nngroup.com/articles/bottom-sheet/

สรุป pattern ที่เหมาะกับ TMK:

- Desktop: right-side drawer เป็น default ของ Sale detail/edit/import
- Mobile: fullscreen sheet สำหรับ form ยาว, bottom sheet เฉพาะ quick action สั้น ๆ
- Center modal: เฉพาะ confirm/delete/critical decision

## Current Implementation Notes

Modal กลางจออยู่ที่:

- `src/modals.jsx` บรรทัดประมาณ 100: `export function Modal(...)`
- `src/index.css` บรรทัดประมาณ 754: `.modal-scrim`

CSS ปัจจุบันใช้ scrim เข้ม + blur และจัดกลางจอ:

- `.modal-scrim` ใช้ `display:flex`, `align-items:center`, `justify-content:center`
- `.modal` max-width 560px
- `.modal-lg` max-width 740px
- mobile ปรับเป็นเต็มจอแล้ว

Sale popup ที่เจอ:

- `src/saleDashboard.jsx`
  - `MpImportModal`
  - `DrillModal`
- `src/saleCrm.jsx`
  - `CustomerDetail`
- `src/saleCatalog.jsx`
  - เพิ่ม/แก้ไขเสื้อ
  - ลบเสื้อ
  - ยืนยัน import catalog
- `src/saleEntry.jsx`
  - ลบรายการ
  - คนทักวันนี้
- `src/views-2.jsx`
  - drill detail
  - add/edit mapping/form บางส่วน

## UX/UI Direction

### Visual Personality

Sale ควรรู้สึกเป็น "sales command center" ที่นิ่ง คม และอ่านเร็ว ไม่ใช่รายงานบัญชีล้วน ๆ

แนวทางภาพ:

- พื้นหลังยังคงสว่าง สะอาด ใช้ card แบบมีขอบบางและเงาอ่อน
- ลดจำนวน card ที่ดูน้ำหนักเท่ากันทั้งหมด
- KPI สำคัญควรเด่นกว่า chart/table
- ใช้ status chip สีชัด แต่ไม่แสบตา
- ใช้ icon เฉพาะช่วย scan ไม่ใช่ตกแต่ง
- ตารางต้องดู professional: sticky header, hover row, density option, empty/loading/error state ดีขึ้น

## Page-by-Page Audit

## 1. Sale Report / Dashboard

สิ่งที่ดี:

- ภาพรวมดูสะอาดและค่อนข้าง modern
- KPI cards, tabs, filters, charts อยู่ครบ
- มี structure รองรับ drill-down แล้ว

ปัญหาความสวยงาม:

- การ์ดจำนวนมากมีน้ำหนักเท่ากัน ทำให้สายตาไม่รู้ว่าควรอ่านอะไรเป็นอันดับแรก
- filter area กินพื้นที่บนค่อนข้างมาก
- chart/table หลายส่วนดูเป็น dashboard component แยก ๆ มากกว่าหน้าเดียวที่มี narrative
- ปุ่ม import อยู่เด่น แต่ยังไม่กลมกลืนกับ toolbar ทั้งหน้า

แผนปรับ:

1. ทำ top zone ใหม่เป็น compact command bar:
   - Date range / channel / salesperson / compare อยู่แถวเดียวหรือสองแถวแบบ compact
   - ปุ่ม `นำเข้าไฟล์ขาย` อยู่ขวาสุด เป็น primary action
2. ทำ hero metric block:
   - ยอดขายรวม / ออเดอร์ / กำไร / conversion หรือ repeat rate
   - มี trend indicator และ short insight ใต้ metric
3. ลด card เท่ากันด้วย hierarchy:
   - Primary KPI กว้างกว่า
   - Secondary KPI เป็น compact tiles
   - Insight/alert เป็น side rail หรือ band
4. Drill-down ทุกจุดเปิดเป็น right drawer ไม่ใช่ centered modal

## 2. Sale > Orders

สิ่งที่ดี:

- ตารางอ่านได้
- filter chips ดูสะอาด
- เหมาะกับงานค้นหา/ตรวจสอบ

ปัญหาความสวยงาม:

- หน้า table-heavy มาก
- แต่ละ row ยังไม่ช่วยให้ scan สถานะออเดอร์เร็วพอ
- รายละเอียดออเดอร์ควรดูแบบข้างหน้าเดิม ไม่ควรทับกลางจอ

แผนปรับ:

1. เพิ่ม table density ที่นิ่งขึ้น: row height คงที่, sticky header, hover state ชัด
2. ทำ status/payment/channel เป็น chip สีมาตรฐาน
3. กด row แล้วเปิด `OrderDetailSheet` ด้านขวา
4. Drawer แสดง:
   - summary ออเดอร์
   - customer
   - items/SKU
   - payment/shipping
   - raw source/debug collapsible

## 3. Sale > Entry

สิ่งที่ดี:

- flow บันทึกขายตรงมีอยู่แล้ว
- field ครบ
- มีรายการที่กรอกด้านล่าง

ปัญหาความสวยงาม:

- form ดูเรียบและกระจาย ยังไม่รู้สึกเป็น workflow
- ช่องกรอกหลายช่องน้ำหนักเท่ากัน
- action หลักยังไม่รู้สึก anchored พอ
- modal `คนทักวันนี้` ถ้าเป็นงานกรอก/แก้ไข ควรอยู่ขวาแทนกลางจอ

แผนปรับ:

1. แบ่ง form เป็น section ที่ชัด:
   - ข้อมูลออเดอร์
   - ลูกค้า/ช่องทาง
   - ยอดเงิน/จำนวน
   - หมายเหตุ
2. ใช้ sticky action footer ใน card/form
3. ทำ lead/funnel input เป็น side sheet:
   - desktop: right drawer 480-560px
   - mobile: fullscreen sheet
4. รายการด้านล่างเพิ่ม visual state:
   - success row after save
   - delete confirm ยังเป็น centered modal ได้

## 4. Sale > Shirt Catalog

สิ่งที่ดี:

- มี grid/list view
- card layout เหมาะกับ catalog
- filter/search ชัด

ปัญหาความสวยงาม:

- placeholder รูปสีเทาทำให้ทั้งหน้าดู sterile
- card หลายใบคล้ายกันมาก
- ราคา/ข้อมูลที่เป็น 0 ทำให้หน้าดูเหมือนข้อมูลยังไม่พร้อม
- add/edit form เป็น centered modal ใหญ่ ตัด context ของ catalog

แผนปรับ:

1. ทำ product visual placeholder ใหม่:
   - ใช้ pattern/texture block ที่ดูเหมือนผ้า หรือ swatch สี
   - ถ้ามี image_url ใช้รูปจริงก่อน
   - ถ้าไม่มีรูป แสดง design code + color chip แบบตั้งใจ ไม่ใช่ช่องเทา
2. เพิ่ม data quality badges:
   - ไม่มีรูป
   - ยังไม่ตั้งราคา
   - ยังไม่ map design
3. เพิ่ม/แก้ไขเสื้อใช้ `ShirtFormSheet` ด้านขวา:
   - desktop width 640px
   - sticky footer: ยกเลิก / บันทึก
   - preview card อยู่บนสุดของ drawer
4. ลบเสื้อและ import catalog confirmation ยังใช้ centered modal ได้

## 5. Sale > CRM

สิ่งที่ดี:

- มี metric cards และ customer table
- customer detail มีข้อมูลรวมดี
- เหมาะกับการทำ customer 360 ต่อ

ปัญหาความสวยงาม:

- หน้า CRM ยังดูเหมือน list/table มากกว่า workspace สำหรับ follow-up
- customer detail ตอนนี้เป็น centered modal ทั้งที่เหมาะกับ right drawer มาก
- row ยังไม่ช่วยแยกลูกค้าสำคัญ/ลูกค้าใหม่/ลูกค้าซื้อซ้ำได้เร็วพอ

แผนปรับ:

1. เปลี่ยน `CustomerDetail` เป็น `CustomerDetailSheet`
2. Drawer width 560-640px:
   - header: ชื่อลูกค้า + tier + lifetime value
   - quick stats 3-4 ใบ
   - timeline/order history
   - contact/action area
3. Table row เพิ่ม:
   - avatar initials
   - tier chip
   - last order
   - repeat/lifetime badge
4. Top CRM cards ควรแบ่งเป็น:
   - revenue/customer health
   - follow-up queue
   - new/repeat split

## 6. Sale > Data / Import Export

สิ่งที่ดี:

- action cards เข้าใจง่าย
- import/reconcile เป็น capability สำคัญ
- alias manager มีคุณค่าในการ clean data

ปัญหาความสวยงาม:

- action cards ยัง flat และคล้ายกัน
- import wizard เป็น centered modal ทั้งที่งาน import ต้องดู context/ผลลัพธ์หลังนำเข้า
- alias table ยังดู technical

แผนปรับ:

1. เปลี่ยน `MpImportModal` เป็น `ImportSheet`
2. Drawer width 680-760px:
   - stepper ด้านบน
   - upload/drop zone
   - preview/reconcile results
   - sticky footer action
3. หน้า Data แบ่งเป็น 3 band:
   - Import now
   - Reconciliation status
   - Name aliases / data mapping
4. Alias manager ใช้ inline edit หรือ mini side sheet 440px สำหรับแก้ชื่อพ้อง

## 7. Sale > Data Health

สิ่งที่ดี:

- มีแนวคิด health/checklist ถูกทิศ
- เหมาะกับการเป็น prerequisite ก่อนดูรายงาน

ปัญหาความสวยงาม:

- health information ถ้าเป็น text/table มากไป จะดูเหมือน debug page
- ยังควรทำ severity hierarchy ให้ชัดกว่าเดิม

แผนปรับ:

1. ทำ severity cards:
   - Critical
   - Warning
   - Clean
2. ทำ checklist ที่แก้ได้ทีละเรื่อง:
   - duplicate/missing salesperson/missing design/missing price
3. กด issue เปิด right drawer:
   - issue detail
   - sample rows
   - suggested fix
   - action
4. ใช้ progress/health score เฉพาะเมื่อคำนวณได้จริง ไม่ทำ decorative score

## Popup / Drawer Migration Plan

## Drawer Component Spec

สร้าง component ใหม่ ไม่แก้ `Modal` เดิมตรง ๆ ในรอบแรก

ชื่อแนะนำ:

- `SideSheet`
- หรือ `DrawerModal`

ไฟล์ที่เหมาะ:

- ถ้าใช้ร่วมหลายหน้า: `src/modals.jsx`
- ถ้าอยากแยกใหม่: `src/components/SideSheet.jsx` แล้ว export ไปใช้

Props ขั้นต่ำ:

```jsx
<SideSheet
  icon="user"
  title="ชื่อลูกค้า"
  sub="VIP · ฿120,000 · 12 ครั้ง"
  onClose={...}
  footer={...}
  size="md" // sm | md | lg | xl
  confirmOnClose={dirty}
>
  ...
</SideSheet>
```

Desktop behavior:

- Anchor ขวาเสมอ
- Width:
  - `sm`: 440px
  - `md`: 560px
  - `lg`: 680px
  - `xl`: 760px
- Max width: `min(var width, calc(100vw - 32px))`
- Height: 100dvh
- Header sticky top
- Body scroll
- Footer sticky bottom
- Scrim เบากว่า modal กลาง: `rgba(8,18,32,.28)` และ blur ไม่เกิน 2-4px
- Animation slide from right 180-220ms
- Esc closes
- Click scrim closes only when safe or confirmed
- Focus เข้า drawer ตอนเปิด และ restore focus ตอนปิด

Mobile behavior:

- Form/detail ยาว: fullscreen sheet
- Quick action สั้น: bottom sheet ได้ แต่ไม่ stack หลายชั้น
- Header/footer sticky
- ห้ามมี horizontal overflow

CSS class proposal:

```css
.sheet-scrim {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  justify-content: flex-end;
  background: rgba(8, 18, 32, .28);
  backdrop-filter: blur(3px);
}

.side-sheet {
  height: 100dvh;
  width: min(560px, calc(100vw - 32px));
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--sh-pop);
  display: flex;
  flex-direction: column;
  animation: sheetIn .2s var(--ease) both;
}
```

อย่าใช้ card ซ้อน card ใน drawer เยอะเกินไป ให้ใช้ section divider, compact metric strip, และ table/list ที่อ่านง่ายแทน

## Which Popup Goes Where

| Popup / Flow | Current | New UI | Priority |
|---|---:|---|---:|
| Dashboard drill-down | Center modal | Right drawer `lg` | P0 |
| CRM customer detail | Center modal | Right drawer `md/lg` | P0 |
| Shirt add/edit | Center modal | Right drawer `lg` | P0 |
| Marketplace import | Center modal | Right drawer `xl` | P1 |
| Entry: คนทักวันนี้ | Center modal | Right drawer `sm/md` | P1 |
| Order detail | If/when added | Right drawer `md/lg` | P1 |
| Data health issue detail | If/when added | Right drawer `lg` | P1 |
| Delete confirmation | Center modal | Keep center modal | Keep |
| Import catalog confirmation | Center modal | Keep center modal | Keep |
| Login / Terms | Center/full page | Keep | Keep |

## Implementation Priority

## P0 — Build SideSheet + Migrate Most Visible Sale Popups

1. Add `SideSheet` component.
2. Add CSS classes for right drawer.
3. Migrate:
   - `saleDashboard.jsx` `DrillModal`
   - `saleCrm.jsx` `CustomerDetail`
   - `saleCatalog.jsx` add/edit shirt form
4. Verify:
   - desktop 1440px
   - tablet 768px
   - mobile 390px
   - Esc close
   - click outside close
   - dirty form confirm
   - footer does not overlap content

## P1 — Import / Data / Entry Sheets

1. Convert `MpImportModal` to right drawer or wrap it with `SideSheet`.
2. Convert `คนทักวันนี้` form to small right sheet.
3. Improve Data page hierarchy around import/reconcile/alias.
4. Add issue detail sheet for Data Health if issue rows exist.

## P2 — Visual Polish Page by Page

1. Dashboard hierarchy:
   - compact filter toolbar
   - primary KPI hero
   - secondary metric strip
   - chart/table spacing
2. Orders:
   - row status chips
   - sticky header
   - row hover/select state
3. Catalog:
   - better placeholders
   - quality badges
   - stable card dimensions
4. CRM:
   - avatar initials
   - tier chips
   - follow-up visual queue
5. Entry:
   - grouped fields
   - sticky action footer
   - better success/empty states

## P3 — Design Token Cleanup

หลังย้าย drawer แล้วค่อยทำรอบสี/spacing:

- ตรวจสีทั้งหมดไม่ให้กลายเป็น palette โทนเดียว
- จำกัด shadow ให้มี 2-3 level พอ
- card radius ให้คงที่
- button height, input height, chip height ต้องสม่ำเสมอ
- table density ต้องคงที่ทุกหน้า Sale

## Acceptance Criteria

งานถือว่าเสร็จเมื่อ:

1. ใน desktop, popup งาน Sale ที่เป็น detail/edit/import เปิดจากด้านขวา ไม่ขึ้นกลางจอ
2. Center modal เหลือเฉพาะ confirm/delete/critical decision
3. Drawer ทุกตัวมี:
   - close button
   - Esc close
   - focus state ที่ไม่หลุด
   - sticky header/footer
   - scroll body
   - mobile layout ที่ไม่ล้นจอ
4. หน้า Sale ทุกหน้าอ่าน hierarchy ได้ใน 5 วินาที:
   - ตอนนี้อยู่หน้าอะไร
   - ตัวเลขหรือ action สำคัญคืออะไร
   - ต้องกดอะไรต่อ
5. Catalog card ไม่มี placeholder เทาดิบเป็น default หลัก
6. CRM detail เปิดแล้วไม่บัง context ของ customer list ทั้งหมด
7. Import flow ไม่ทำให้ผู้ใช้รู้สึกหลุดจากหน้า Data/Sale Report

## Suggested Test Pass

Manual visual pass:

1. เปิด `Sale > รายงานขาย`
2. กด drill-down จาก chart/table
3. กดนำเข้าไฟล์ขาย
4. เปิด `Sale > ออเดอร์` แล้วคลิก row ถ้ามี detail
5. เปิด `Sale > บันทึกขาย`
6. เปิด `คนทักวันนี้`
7. เปิด `Sale > แคตตาล็อกเสื้อ`
8. เพิ่ม/แก้ไขเสื้อ
9. ลบเสื้อ ตรวจว่ายังเป็น confirm modal
10. เปิด `Sale > ลูกค้า (CRM)`
11. คลิกลูกค้า ตรวจ drawer
12. เปิด `Sale > ข้อมูล`
13. เปิด import และ alias edit
14. เปิด mobile viewport 390x844 แล้วทำซ้ำ flow หลัก

Automated checks ที่ควรทำ:

```bash
npm run build
npm run lint
```

หมายเหตุจากรอบก่อน:

- `npm run build` ผ่าน
- `npm run lint` ยังมี error/warning เดิมจำนวนมาก ควรแยก task lint cleanup ไม่ควรผูกกับ UI migration รอบแรก

## Files to Touch First

เริ่มจากไฟล์เหล่านี้:

- `src/modals.jsx`
  - เพิ่ม `SideSheet`
  - reuse `Icon`
  - reuse `confirmOnClose`
- `src/index.css`
  - เพิ่ม `.sheet-scrim`, `.side-sheet`, `.side-sheet-head`, `.side-sheet-body`, `.side-sheet-foot`
  - เพิ่ม responsive behavior
- `src/saleDashboard.jsx`
  - เปลี่ยน `DrillModal` เป็น `SideSheet`
- `src/saleCrm.jsx`
  - เปลี่ยน `CustomerDetail` เป็น `SideSheet`
- `src/saleCatalog.jsx`
  - เปลี่ยน add/edit shirt modal เป็น `SideSheet`
- `src/saleImportHub.jsx` และ call sites ของ `MpImportModal`
  - รอบถัดไปหลัง P0 ถ้าไม่อยากเสี่ยงกับ import flow

## Important Cautions

- อย่าแก้ `Modal` ให้กลายเป็น drawer ทันที เพราะ modal นี้ถูกใช้หลายระบบนอก Sale
- อย่าเปลี่ยน destructive confirmation เป็น drawer เพราะ confirm กลางจอยังเหมาะกว่า
- อย่า stack drawer ซ้อน drawer ถ้าจำเป็นต้องเปิด flow ย่อย ให้ใช้ inline expand หรือเปลี่ยน content ใน drawer เดิม
- อย่าเพิ่ม decorative gradient/orb เพื่อความสวยอย่างเดียว ระบบนี้ควรดูเป็น operation tool
- อย่าแก้ business logic ของยอดขายระหว่างทำ UI polish

## Final Design Intent

หลังทำเสร็จ Sale ควรรู้สึกเหมือน workspace ที่ผู้ใช้เปิดค้างไว้ทั้งวัน:

- dashboard อ่านเร็ว
- table scan ง่าย
- detail เปิดข้าง ๆ ไม่หลุด context
- form ยาวไม่อึดอัด
- popup ไม่เด้งกลางจอพร่ำเพรื่อ
- mobile ยังใช้ได้จริง ไม่ใช่ desktop ย่อส่วน

