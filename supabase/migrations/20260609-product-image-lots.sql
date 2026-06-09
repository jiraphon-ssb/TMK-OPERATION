-- ============================================================
-- TMK Operation — รูปสินค้า + ล็อต (batch) ต่อสินค้า
-- ============================================================
-- เพิ่ม 2 คอลัมน์ให้ tmk_products:
--   image_url : รูปสินค้า (เก็บเป็น data URL ที่ย่อขนาดแล้ว เหมือน logo ช่องทาง)
--   lots      : รายการล็อตแบบ ไซส์ × สี (เสื้อพิมพ์ลาย):
--               [{ id, lotNo, date, cost, note,
--                  sizes: ['S','M','L'],                 -- ไซส์ในล็อต (subset ของ XS..10XL)
--                  colors: [{ id, name, hex }],          -- 7-8 สี
--                  grid: { [colorId]: { [size]: qty } }  -- จำนวนต่อ สี×ไซส์
--               }]
-- เมื่อสินค้ามีล็อต → "สต็อกคงเหลือ" = ผลรวมทุกช่อง grid ของทุกล็อตอัตโนมัติ;
--   มูลค่าคงคลัง = Σ จำนวน × ต้นทุน/ตัว
-- (ถ้ายังไม่มีล็อต ใช้ stock_on_hand เดิมเหมือนเดิม — ไม่กระทบของเก่า)
-- รันใน Supabase SQL Editor
-- ============================================================

alter table public.tmk_products
  add column if not exists image_url text;

alter table public.tmk_products
  add column if not exists lots jsonb not null default '[]'::jsonb;

comment on column public.tmk_products.image_url is
  'รูปสินค้า (data URL ย่อขนาดแล้ว) — เว้นว่าง = ไม่มีรูป';
comment on column public.tmk_products.lots is
  'ล็อต ไซส์×สี: [{ id, lotNo, date, cost, note, sizes, colors:[{id,name,hex}], grid:{colorId:{size:qty}} }]; มีล็อต → สต็อก = ผลรวมทุกช่อง grid';
