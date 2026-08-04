import type { Order, OrderStatus, OrderType } from "@/lib/types"

export const orderStatusMeta: Record<OrderStatus, {
  label: string
  description: string
  className: string
}> = {
  new: {
    label: "Por confirmar",
    description: "Revisa el pedido antes de enviarlo a cocina.",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  confirmed: {
    label: "Confirmado",
    description: "El pedido está aceptado y esperando preparación.",
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  preparing: {
    label: "En preparación",
    description: "Cocina está trabajando en este pedido.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  ready: {
    label: "Listo",
    description: "Está terminado y esperando entrega al cliente o repartidor.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  out_for_delivery: {
    label: "En reparto",
    description: "El pedido salió rumbo al domicilio.",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  delivered: {
    label: "Entregado",
    description: "El pedido se completó correctamente.",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  cancelled: {
    label: "Cancelado",
    description: "El pedido fue cancelado y ya no puede reabrirse.",
    className: "border-red-200 bg-red-50 text-red-700",
  },
}

const flows: Record<OrderType, OrderStatus[]> = {
  pickup: ["new", "confirmed", "preparing", "ready", "delivered"],
  delivery: ["new", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"],
}

export function getOrderFlow(type: OrderType) {
  return flows[type]
}

export function getNextOrderStatus(order: Pick<Order, "status" | "type">) {
  if (order.status === "cancelled" || order.status === "delivered") return null
  const flow = flows[order.type]
  return flow[flow.indexOf(order.status) + 1] ?? null
}

export function getStatusActionLabel(status: OrderStatus) {
  return {
    new: "Recibir pedido",
    confirmed: "Confirmar pedido",
    preparing: "Comenzar preparación",
    ready: "Marcar como listo",
    out_for_delivery: "Enviar a reparto",
    delivered: "Marcar como entregado",
    cancelled: "Cancelar pedido",
  }[status]
}
