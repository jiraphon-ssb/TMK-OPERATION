# shadcn/ui Migration — สถานะ + คู่มือย้าย custom CSS → shadcn

ทิศทาง: UI ใหม่ทั้งหมดใช้ shadcn/ui (Radix + Tailwind + lucide ติดตั้งจริงแล้ว · `@/components/ui/*`). ไฟล์นี้ track ว่าส่วนไหนยังเป็น custom CSS เดิม (`.card`/`.btn`/`.chip`) แล้วต้องย้าย

## Pattern มาตรฐาน (Codex ตั้งไว้ — ยึดอันนี้)

ดูตัวอย่างจริงที่ย้ายแล้ว: การ์ด "อัพเดทล่าสุด" ใน `views-1.jsx` (HomeView)

```jsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

<Card className="flex flex-col">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="flex items-center text-base font-semibold">
      <Icon name="up" className="mr-2 h-4 w-4 text-primary" /> หัวข้อ
      <span className="ml-2 text-xs font-normal text-muted-foreground">(ข้อความรอง)</span>
    </CardTitle>
    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={...}>ดูทั้งหมด</Button>
  </CardHeader>
  <CardContent className="flex flex-1 flex-col">…เนื้อหา…</CardContent>
</Card>
```

แมปคลาสเดิม → shadcn:
| เดิม (custom CSS) | shadcn |
|---|---|
| `<div className="card">` | `<Card>` |
| `<div className="card-head"><h3>…</h3><button>…</button></div>` | `<CardHeader className="flex flex-row items-center justify-between">` + `<CardTitle>` + `<Button>` |
| `<button className="btn btn-sm btn-primary">` | `<Button size="sm">` |
| `<button className="btn btn-sm">` | `<Button variant="outline" size="sm">` |
| `<button className="btn btn-sm btn-ghost">` | `<Button variant="ghost" size="sm">` |
| `<span className="chip chip-good">` | `<Badge variant="…">` หรือ class สีตามเดิม |
| `<table className="table">` | `<Table>` (`@/components/ui/table`) |
| สี: `var(--accent)`, `text-primary`, `text-muted-foreground` | ใช้ token shadcn ที่ align แล้ว |

หมายเหตุ:
- **Icon**: ใช้ custom `<Icon name="…">` ต่อได้ (Codex ใช้ + ใส่ Tailwind class `h-4 w-4 text-primary`) — ไม่บังคับเปลี่ยนเป็น lucide ทันที
- typography util เดิม (`.num`, `.cap`, `.h1`, `.sm`) ยังใช้ได้ระหว่างเปลี่ยน
- token align แล้ว (`--card`=surface, `--background`=paper, `--muted`=surface-2 ฯลฯ) → shadcn Card สีตรงธีม

## สถานะรายไฟล์ (custom `.card` ที่เหลือ)

| ไฟล์ / ส่วน | custom .card | สถานะ |
|---|---:|---|
| `App.jsx` (shell) | 4 | ✅ shell เป็น shadcn (Sidebar/Dropdown/Avatar) แล้ว |
| `views-1.jsx` — **Home** | บางส่วน | 🔄 audit card ย้ายแล้ว · เหลือ digest, campaign, todo, team |
| `views-1.jsx` — **Sales View** (Overview/Channels/Ads/Customers) | ~40 | ❌ ยังเป็น custom ทั้งหมด |
| `views-2.jsx` — Planner/Health/Catalog dispatch | 44 | ❌/🔄 ผสม |
| `saleDashboard.jsx` | 68 | ❌ custom .card (มี SideSheet แล้ว แต่ card ยังเดิม) |
| `saleCrm/Entry/Catalog/ImportHub.jsx` | 9–12 ต่อไฟล์ | ❌ custom .card |

## ลำดับงาน (ที่ผู้ใช้สั่ง)

1. ✅/🔄 **Home — การ์ดสรุปเมื่อวาน (digest)** → shadcn Card
2. ✅/🔄 **Home — การ์ดแคมเปญ (donut/Ring)** → shadcn Card
3. ❌ **Sales View ทั้งหน้า** (`SalesOverview`/`SalesChannels`/`SalesAds`/`SalesCustomers`) → shadcn — ทำทีละ sub-view + verify

## หลังจากนั้น (เฟสถัดไป)
- `saleDashboard` + Sale views (Orders/CRM/Entry/Catalog) — card → shadcn Card
- Planner (`views-2`)
- เก็บกวาด token ซ้อน (`@layer base` HSL triplet ที่ตายแล้ว บรรทัด 5–29 ของ index.css)
