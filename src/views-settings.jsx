import { Icon, PageSkeleton, useBeat } from './components.jsx';
import { WhatsNewPage } from './WhatsNew.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CampaignsView, TargetsView, GeneralSettings, BrandsView, ChannelsView, DutiesView, RolesView, TrashView } from './views-settings-tabs.jsx';
/* ====================  SETTINGS (replaces System)  ==================== */
// wrapper บางๆ (hook เดียว) → โชว์ skeleton ตอนเข้า/สลับแท็บ โดยไม่ชน hook-order ของ body
export function SettingsView(props) {
  // skeleton ครั้งเดียวตอนเข้า (ไม่ remount ตอนสลับแท็บ → ฟอร์มไม่รีเซ็ต)
  const beat = useBeat();
  if (beat) return <PageSkeleton />;
  return <SettingsBody {...props} />;
}
function SettingsBody({ sub, dark, setDark }) {
  const _isAdmin = window.__isAdmin === true;
  const _canEdit = window.__canEdit !== false;
  const TABS = [
    { id: 'general', label: 'ทั่วไป', icon: 'system' },
    { id: 'channels', label: 'ช่องทาง', icon: 'layers' },
    { id: 'brands', label: 'แบรนด์', icon: 'store' },
    { id: 'campaigns', label: 'แคมเปญ', icon: 'megaphone' },
    { id: 'duties', label: 'หน้าที่', icon: 'shield' },
    { id: 'targets', label: 'เป้า & คอม', icon: 'target' },
    { id: 'roles', label: 'สิทธิ์ผู้ใช้', icon: 'users' },
    // 'audit' (ประวัติการใช้งาน) รวมเข้า section "บันทึกกิจกรรม" (LogView · admin-only · PART 54) แล้ว
    { id: 'trash', label: 'ถังขยะ', icon: 'trash' },
    { id: 'updates', label: 'มีอะไรใหม่', icon: 'sparkle' },
  ].filter(t => (t.id === 'roles' ? _isAdmin : (t.id === 'trash' || t.id === 'targets') ? _canEdit : true)); // สิทธิ์ผู้ใช้=admin, ถังขยะ/เป้า=ผู้แก้ไขขึ้นไป
  // ใช้ sub prop โดยตรง — ถ้า sub ไม่ถูกต้อง fallback เป็น 'general' (กันหน้าว่าง)
  const active = TABS.some(t => t.id === sub) ? sub : 'general';
  const setActive = (id) => window.__goSection?.('settings', id);

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto w-full rise">
      <div className="mb-6 space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">การตั้งค่า</h2>
        <p className="text-muted-foreground">จัดการระบบผู้ใช้งาน ช่องทางขาย และการแสดงผล</p>
      </div>
      <div className="h-[1px] w-full bg-border mb-8" />
      
      <Tabs value={active} onValueChange={setActive} className="flex flex-col lg:flex-row gap-8 w-full">
        <aside className="lg:w-1/4 xl:w-1/5 shrink-0">
          <TabsList className="flex flex-col h-auto bg-transparent p-0 space-y-1 w-full items-start">
            {TABS.map(t => (
              <TabsTrigger 
                key={t.id} 
                value={t.id} 
                className="w-full justify-start gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:shadow-none data-[state=active]:font-medium transition-colors"
              >
                <Icon name={t.icon} className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <div className="flex-1 min-w-0">
        <TabsContent value="general" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <GeneralSettings dark={dark} setDark={setDark} />
        </TabsContent>
        <TabsContent value="channels" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <ChannelsView />
        </TabsContent>
        <TabsContent value="brands" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <BrandsView />
        </TabsContent>
        <TabsContent value="campaigns" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <CampaignsView />
        </TabsContent>
        <TabsContent value="duties" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <DutiesView />
        </TabsContent>
        <TabsContent value="targets" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_canEdit && <TargetsView />}
        </TabsContent>
        <TabsContent value="roles" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_isAdmin && <RolesView />}
        </TabsContent>
        <TabsContent value="trash" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_canEdit && <TrashView />}
        </TabsContent>
        <TabsContent value="updates" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <WhatsNewPage />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
