import { Check, X } from "lucide-react"
import { getOrderFlow, orderStatusMeta } from "@/lib/order-status"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"

export function OrderProgress({ order }: { order: Pick<Order, "status" | "type"> }) {
  if (order.status === "cancelled") {
    return <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-100"><X className="h-4 w-4" /></span><span>Este pedido fue cancelado y el flujo terminó.</span></div>
  }

  const flow = getOrderFlow(order.type)
  const currentIndex = flow.indexOf(order.status)

  return (
    <div className="grid w-full items-start" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}>
      {flow.map((status, index) => {
        const completed = index < currentIndex
        const current = index === currentIndex
        return (
          <div key={status} className="relative flex min-w-0 flex-col items-center text-center">
            {index < flow.length - 1 ? (
              <span
                className={cn("absolute top-4 h-0.5", index < currentIndex ? "bg-emerald-500" : "bg-border")}
                style={{ left: "calc(50% + 1rem)", width: "calc(100% - 2rem)" }}
              />
            ) : null}
            <span className={cn("relative z-10 grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold", completed && "border-emerald-600 bg-emerald-600 text-white", current && "border-primary bg-primary text-primary-foreground", !completed && !current && "border-border bg-secondary text-muted-foreground")}>
              {completed ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={cn("mt-2 px-0.5 text-[10px] leading-3 sm:text-[11px] sm:leading-4", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{orderStatusMeta[status].label}</span>
          </div>
        )
      })}
    </div>
  )
}
