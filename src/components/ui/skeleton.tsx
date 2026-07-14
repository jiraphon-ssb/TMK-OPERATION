import { cn } from "@/lib/utils"

// shimmer skeleton — ใช้คลาส .skel กลาง (index.css: พื้น --surface-2 + skelShimmer sweep + reduced-motion)
// แทน animate-pulse ให้ลุคตรงกับ skeleton ทั้งแอป · cn/tailwind-merge จัดการ radius override (rounded-full ฯลฯ) ให้
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("skel rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
