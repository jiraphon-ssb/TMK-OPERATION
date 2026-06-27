import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "./input"

// ช่องค้นหา — shadcn Input + ไอคอนแว่นขยาย (แทน <input className="input"> เดิม)
const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { wrapperClassName?: string }
>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn("relative w-full", wrapperClassName)}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input ref={ref} className={cn("pl-9", className)} {...props} />
  </div>
))
SearchInput.displayName = "SearchInput"

export { SearchInput }
