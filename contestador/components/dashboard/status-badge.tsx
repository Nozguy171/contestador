import { cn } from "@/lib/utils"
import type { OrderStatus, CallLog } from "@/lib/types"

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  new: {
    label: "Nuevo",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  confirmed: {
    label: "Confirmado",
    className: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  preparing: {
    label: "En preparación",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ready: {
    label: "Listo",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  out_for_delivery: {
    label: "En camino",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  delivered: {
    label: "Entregado",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-red-50 text-red-700 border-red-200",
  },
}

const callStatusConfig: Record<CallLog["status"], { label: string; className: string }> = {
  completed: {
    label: "Completada",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  failed: {
    label: "Fallida",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  dropped: {
    label: "Interrumpida",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  incomplete: {
    label: "Incompleta",
    className: "bg-slate-50 text-slate-700 border-slate-200",
  },
}

interface StatusBadgeProps {
  status: OrderStatus
  size?: "sm" | "md"
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status]
  
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.className,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      )}
    >
      {config.label}
    </span>
  )
}

interface CallStatusBadgeProps {
  status: CallLog["status"]
  size?: "sm" | "md"
}

export function CallStatusBadge({ status, size = "md" }: CallStatusBadgeProps) {
  const config = callStatusConfig[status]
  
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.className,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      )}
    >
      {config.label}
    </span>
  )
}
