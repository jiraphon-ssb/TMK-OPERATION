import * as React from "react"
import { format, parseISO } from "date-fns"
import { th } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DatePickerProps {
  value?: string                         // ISO "YYYY-MM-DD"
  onChange: (iso: string) => void
  placeholder?: string
  disabled?: boolean
  min?: string                           // ISO bound
  max?: string
  className?: string
  clearable?: boolean
}

const toISO = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "")

export function DatePicker({ value, onChange, placeholder = "เลือกวันที่", disabled, min, max, className, clearable = true }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const date = value ? parseISO(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}
          className={cn("w-full justify-start text-left font-normal h-9", !value && "text-muted-foreground", className)}>
          <CalendarIcon className="mr-2 size-4 shrink-0 opacity-70" />
          {value && date ? format(date, "d MMM yyyy", { locale: th }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          locale={th}
          disabled={(d: Date) => (!!min && toISO(d) < min) || (!!max && toISO(d) > max)}
          onSelect={(d?: Date) => { onChange(toISO(d)); setOpen(false) }}
        />
        {clearable && value && (
          <div className="border-t p-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false) }}>ล้างวันที่</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
