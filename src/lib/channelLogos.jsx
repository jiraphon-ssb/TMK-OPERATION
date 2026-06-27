/* ============================================================
   channelLogos.jsx — โลโก้แบรนด์ช่องทาง (สีเดียว-สีแบรนด์)
   ใช้ path official จาก simple-icons (Facebook/Shopee/TikTok/LINE)
   ช่องทางไม่มีแบรนด์ (Lazada/Phone/POS/Direct) → ใช้ Icon ทั่วไป
   ============================================================ */
import { siFacebook, siShopee, siTiktok, siLine } from 'simple-icons';
import { Icon } from '../components.jsx';
import { channelColor } from '../charts.jsx';

const BRAND = { Facebook: siFacebook, Shopee: siShopee, TikTok: siTiktok, LINE: siLine };
// ช่องทางไม่มีโลโก้แบรนด์ → ไอคอนแทน
const FALLBACK_ICON = { Lazada: 'bag', Phone: 'phone', POS: 'store', Direct: 'globe', Website: 'globe' };

// สีหลักของช่องทาง (โลโก้แบรนด์ใช้สี official, อื่นๆ ใช้ channelColor)
export const channelTint = (name) => (BRAND[name] ? '#' + BRAND[name].hex : channelColor(name));

export function ChannelLogo({ name, size = 20 }) {
  const b = BRAND[name];
  if (b) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={name}>
        <path d={b.path} />
      </svg>
    );
  }
  return <Icon name={FALLBACK_ICON[name] || 'dot'} />;
}
