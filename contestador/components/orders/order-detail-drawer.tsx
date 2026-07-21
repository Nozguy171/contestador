"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Order, OrderStatus } from "@/lib/types"
import {
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
} from "lucide-react"

interface OrderDetailDrawerProps {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (orderId: string, status: OrderStatus) => void
}

const statusFlow: OrderStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
]

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("es-MX", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatPaymentMethod(method: Order["paymentMethod"]) {
  return {
    cash: "Efectivo",
    card: "Tarjeta",
    online: "Pago en línea",
  }[method]
}

function formatOrderType(type: Order["type"]) {
  return type === "delivery" ? "Entrega a domicilio" : "Recoger en sucursal"
}

function formatStatusLabel(status: OrderStatus) {
  return {
    new: "Nuevo",
    confirmed: "Confirmado",
    preparing: "Preparando",
    ready: "Listo",
    out_for_delivery: "En camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }[status]
}

export function OrderDetailDrawer({ order, open, onOpenChange, onStatusChange }: OrderDetailDrawerProps) {
  if (!order) return null

  const currentStatusIndex = statusFlow.indexOf(order.status)
  const nextStatus =
    order.status !== "cancelled" && currentStatusIndex < statusFlow.length - 1
      ? statusFlow[currentStatusIndex + 1]
      : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border p-4 pr-14 sm:p-6 sm:pr-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-semibold">{order.folio}</SheetTitle>
              <SheetDescription className="sr-only">
                Detalle completo del pedido seleccionado.
              </SheetDescription>
              <p className="mt-1 text-sm text-muted-foreground">{order.customerName}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="break-all text-sm font-medium">{order.phoneNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Pago</p>
                  <p className="text-sm font-medium">{formatPaymentMethod(order.paymentMethod)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Recibido</p>
                  <p className="text-sm font-medium">{formatDateTime(order.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p className="text-sm font-medium">{formatOrderType(order.type)}</p>
                </div>
              </div>
            </div>

            {order.deliveryAddress ? (
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">Dirección de entrega</h4>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-sm text-muted-foreground">{order.deliveryAddress}</p>
                </div>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-sm font-medium text-foreground">Productos del pedido</h4>
              <div className="overflow-hidden rounded-xl border border-border">
                {order.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-3 p-3 ${
                      index !== order.items.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.quantity}x</span>
                        <span className="break-words text-sm">{item.name}</span>
                      </div>
                      {item.modifiers?.length ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.modifiers.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}

                <div className="space-y-1 bg-secondary/50 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Costo de envío</span>
                      <span>{formatCurrency(order.deliveryFee)}</span>
                    </div>
                  ) : null}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {order.notes ? (
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">Notas</h4>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-sm text-muted-foreground">{order.notes}</p>
                </div>
              </div>
            ) : null}

            {order.aiCallSummary ? (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageSquare className="h-4 w-4" />
                  Resumen de la llamada
                </h4>
                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="text-sm text-muted-foreground">{order.aiCallSummary}</p>
                </div>
              </div>
            ) : null}

            {order.transcript ? (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4" />
                  Vista previa de la transcripción
                </h4>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                    {order.transcript}
                  </p>
                </div>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-sm font-medium text-foreground">Historial de estatus</h4>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="space-y-3">
                  {order.statusHistory.map((change, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div
                        className={`mt-1 h-2 w-2 rounded-full ${
                          index === order.statusHistory.length - 1
                            ? "bg-primary"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <StatusBadge status={change.status} size="sm" />
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(change.timestamp)}
                          </span>
                        </div>
                        {change.by ? (
                          <p className="mt-1 text-xs text-muted-foreground">por {change.by}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            {order.status !== "cancelled" && order.status !== "delivered" ? (
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => onStatusChange(order.id, "cancelled")}
              >
                Cancelar pedido
              </Button>
            ) : null}
            {nextStatus ? (
              <Button
                className="flex-1 rounded-xl"
                onClick={() => onStatusChange(order.id, nextStatus)}
              >
                Mover a {formatStatusLabel(nextStatus)}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
