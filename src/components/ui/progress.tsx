import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value?: number
  /** สีแท่ง (token หรือ hex) — default var(--accent) */
  indicatorColor?: string
}

// Progress แบบเบา (ตาม API/สไตล์ shadcn) — ไม่พึ่ง @radix-ui/react-progress
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorColor, ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, value))
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]",
          className
        )}
        {...props}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: indicatorColor || "var(--accent)" }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
