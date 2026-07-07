import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  // range mode: เลือกวันเริ่มแล้ว → hover วันไหน โชว์แถบช่วง preview ก่อนคลิกจริง
  const [hovered, setHovered] = React.useState<Date | undefined>(undefined)
  const anyProps = props as any
  const sel = anyProps.selected
  const picking = anyProps.mode === "range" && sel?.from && !sel?.to
  const preview =
    picking && hovered && hovered.getTime() !== sel.from.getTime()
      ? hovered < sel.from
        ? { from: hovered, to: sel.from }
        : { from: sel.from, to: hovered }
      : undefined
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 rounded-none bg-transparent p-0 opacity-60 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "text-muted-foreground w-9 pb-1 font-normal text-[0.8rem]",
        row: "flex w-full",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 rounded-lg p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start:
          "day-range-start aria-selected:bg-[var(--accent)] aria-selected:text-white aria-selected:font-semibold",
        day_range_end:
          "day-range-end aria-selected:bg-[var(--accent)] aria-selected:text-white aria-selected:font-semibold",
        day_selected:
          "bg-[var(--accent)] text-white hover:bg-[var(--accent-2)] hover:text-white focus:bg-[var(--accent)] focus:text-white",
        day_today:
          "relative font-semibold after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-current",
        day_outside:
          "day-outside text-muted-foreground opacity-60 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-40",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("size-4", className)} {...props} />
        ),
      }}
      {...props}
      onDayMouseEnter={(d: Date, m: any, e: any) => {
        if (picking) setHovered(d)
        anyProps.onDayMouseEnter?.(d, m, e)
      }}
      onDayMouseLeave={(d: Date, m: any, e: any) => {
        setHovered(undefined)
        anyProps.onDayMouseLeave?.(d, m, e)
      }}
      modifiers={{ ...(preview ? { preview } : {}), ...anyProps.modifiers }}
      modifiersClassNames={{
        preview: "bg-accent text-accent-foreground",
        ...anyProps.modifiersClassNames,
      }}
    />
  )
}

export { Calendar }
