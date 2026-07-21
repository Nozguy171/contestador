import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  helperText?: string
  className?: string
  iconClassName?: string
}

export function StatCard({ title, value, icon: Icon, helperText, className, iconClassName }: StatCardProps) {
  return (
    <Card className={cn("gap-0 border-border py-0 shadow-sm transition-shadow duration-200 hover:shadow-md", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5 sm:space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
            {helperText ? (
              <p className="text-xs font-medium text-muted-foreground">
                {helperText}
              </p>
            ) : null}
          </div>
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10",
            iconClassName || "bg-secondary"
          )}>
            <Icon className="h-5 w-5 text-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
