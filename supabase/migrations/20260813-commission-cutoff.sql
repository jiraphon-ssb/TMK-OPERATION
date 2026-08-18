-- ============================================================================
-- 20260813-commission-cutoff.sql — วันตัดรอบค่าคอม (ค่าเดียวทั้งทีม) ใน tmk_settings
-- ============================================================================
-- ฟีเจอร์: ป๊อปอัพ "ค่าคอมรอบตัด" (docs/COMMISSION-CYCLE-PLAN.md)
--   รอบคอมจริงของทีมตัดวันที่ 26 → 25 ของเดือนถัดไป (ไม่ใช่เดือนปฏิทิน)
--   คอลัมน์นี้เก็บ "วันตัด" (1–28) — FE อ่านตอนเปิด popup · แอดมินแก้จากใน popup ได้
-- FE ทน schema: ยังไม่รันไฟล์นี้ → popup ใช้ค่า default 26 (อ่านได้ เซฟไม่ได้)
-- Idempotent: รันซ้ำได้ · VERIFY ท้ายไฟล์ · rollback ล่างสุด
-- ============================================================================

begin;

alter table public.tmk_settings
  add column if not exists commission_cutoff_day integer default 26;

-- กันค่าหลุดช่วง (29-31 จะพังเดือน ก.พ.) — constraint แบบ idempotent
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tmk_settings_commission_cutoff_day_range'
  ) then
    alter table public.tmk_settings
      add constraint tmk_settings_commission_cutoff_day_range
      check (commission_cutoff_day between 1 and 28);
  end if;
end $$;

comment on column public.tmk_settings.commission_cutoff_day is
  'วันตัดรอบค่าคอม (1-28) — รอบ = วันที่นี้ของเดือนก่อน ถึง วันก่อนหน้าของเดือนนี้ (26 ก.ค.–25 ส.ค. = รอบ ส.ค.) · 1 = เดือนปฏิทิน';

-- แถว main มีอยู่แล้วในทุก deployment — เติมค่า default ให้ถ้ายัง null
update public.tmk_settings set commission_cutoff_day = 26
  where id = 'main' and commission_cutoff_day is null;

commit;

-- บันทึกว่ารันแล้ว (ถ้ารัน 20260811-migrations-tracking.sql ไปแล้ว)
-- select public.tmk_migration_applied('20260813-commission-cutoff.sql', 'วันตัดรอบค่าคอม');

-- ── VERIFY (ทุกบรรทัดต้อง ✅) ─────────────────────────────────────────────────
select 'คอลัมน์ commission_cutoff_day มีจริง (ต้อง = 1)' as check_item, count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'tmk_settings' and column_name = 'commission_cutoff_day'
union all
select 'แถว main มีค่า 1-28 (ต้อง = 1)', count(*)::text,
       case when count(*) = 1 then '✅' else '❌' end
from public.tmk_settings where id = 'main' and commission_cutoff_day between 1 and 28;

-- ── ROLLBACK (copy ไปรันแยก) ────────────────────────────────────────────────
-- begin;
--   alter table public.tmk_settings drop constraint if exists tmk_settings_commission_cutoff_day_range;
--   alter table public.tmk_settings drop column if exists commission_cutoff_day;
-- commit;
