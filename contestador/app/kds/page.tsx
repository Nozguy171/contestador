"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listOrders, updateOrderStatus } from "@/lib/api"
import { getNextOrderStatus, getStatusActionLabel, orderStatusMeta } from "@/lib/order-status"
import type { Order, OrderStatus } from "@/lib/types"
import { toast } from "sonner"
import { Bike, Check, ChefHat, Clock3, RefreshCw, ShoppingBag, TimerReset } from "lucide-react"

const columns: Array<{
  id: string
  title: string
  description: string
  statuses: OrderStatus[]
  color: string
  icon: typeof ShoppingBag
}> = [
  { id: "incoming", title: "Por confirmar", description: "Revisar antes de preparar", statuses: ["new"], color: "border-blue-200 bg-blue-50/40", icon: ShoppingBag },
  { id: "kitchen", title: "En cocina", description: "Confirmados y preparando", statuses: ["confirmed", "preparing"], color: "border-amber-200 bg-amber-50/40", icon: ChefHat },
  { id: "ready", title: "Listos", description: "Esperando entrega o reparto", statuses: ["ready"], color: "border-emerald-200 bg-emerald-50/40", icon: Check },
  { id: "delivery", title: "En reparto", description: "Rumbo al domicilio", statuses: ["out_for_delivery"], color: "border-violet-200 bg-violet-50/40", icon: Bike },
]

function elapsed(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export default function KdsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [now, setNow] = useState(Date.now())
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function load(showSpinner = false) {
    try {
      if (showSpinner) setIsRefreshing(true)
      setErrorMessage("")
      setOrders(await listOrders())
      setLastUpdated(new Date())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar cocina.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const poller = window.setInterval(() => {
      setNow(Date.now())
      void load()
    }, 3000)
    return () => window.clearInterval(poller)
  }, [])

  const activeOrders = useMemo(
    () => orders.filter((order) => !["delivered", "cancelled"].includes(order.status)),
    [orders]
  )
  const lateOrders = activeOrders.filter((order) => now - new Date(order.createdAt).getTime() > 20 * 60000).length

  async function advance(order: Order) {
    const nextStatus = getNextOrderStatus(order)
    if (!nextStatus) return
    try {
      setUpdatingId(order.id)
      const updated = await updateOrderStatus(order.id, nextStatus)
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item))
      setLastUpdated(new Date())
      toast.success(`${order.folio}: ${orderStatusMeta[nextStatus].label}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el pedido."
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pantalla de cocina</h1>
            <p className="text-sm text-muted-foreground">Pedidos de llamadas, POS y autoservicio en una cola que se actualiza cada 3 segundos.</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end"><Button variant="outline" className="rounded-xl" disabled={isRefreshing} onClick={() => void load(true)}><RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />{isRefreshing ? "Actualizando..." : "Actualizar ahora"}</Button>{lastUpdated ? <p className="text-xs text-muted-foreground">Última actualización: {lastUpdated.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p> : null}</div>
        </div>

        {errorMessage ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}

        <div className="grid gap-3 sm:grid-cols-3"><Card className="gap-0 py-4"><CardContent className="flex items-center gap-3 px-4"><ShoppingBag className="h-5 w-5 text-blue-600" /><div><p className="text-xs text-muted-foreground">Pedidos activos</p><p className="text-xl font-semibold">{activeOrders.length}</p></div></CardContent></Card><Card className="gap-0 py-4"><CardContent className="flex items-center gap-3 px-4"><ChefHat className="h-5 w-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">En cocina</p><p className="text-xl font-semibold">{activeOrders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length}</p></div></CardContent></Card><Card className={`gap-0 py-4 ${lateOrders ? "border-red-200 bg-red-50" : ""}`}><CardContent className="flex items-center gap-3 px-4"><TimerReset className={`h-5 w-5 ${lateOrders ? "text-red-600" : "text-muted-foreground"}`} /><div><p className="text-xs text-muted-foreground">Más de 20 minutos</p><p className="text-xl font-semibold">{lateOrders}</p></div></CardContent></Card></div>

        {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando pedidos...</CardContent></Card> : (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((column) => {
              const columnOrders = activeOrders.filter((order) => column.statuses.includes(order.status))
              const Icon = column.icon
              return (
                <section key={column.id} className={`min-h-40 rounded-2xl border p-3 ${column.color}`}>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" />{column.title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{column.description}</p></div>
                    <Badge variant="secondary">{columnOrders.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {columnOrders.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-background/60 py-8 text-center text-xs text-muted-foreground">Sin pedidos</div> : columnOrders.map((order) => {
                      const nextStatus = getNextOrderStatus(order)
                      const isLate = now - new Date(order.createdAt).getTime() > 20 * 60000
                      return (
                        <Card key={order.id} className="gap-0 py-0 shadow-sm">
                          <CardHeader className="border-b border-border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div><CardTitle className="text-base">{order.folio}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{order.customerName}</p><div className="mt-2"><StatusBadge status={order.status} size="sm" /></div></div>
                              <div className="flex max-w-28 flex-col items-end gap-1"><Badge variant={order.source === "voice" ? "default" : "secondary"}>{order.source === "voice" ? "Llamada" : order.source === "kiosk" ? "Autoservicio" : "POS"}</Badge><Badge variant="outline">{order.type === "delivery" ? "Entrega" : "Recoger"}</Badge><p className={`mt-1 flex items-center justify-end gap-1 text-xs ${isLate ? "font-semibold text-red-600" : "text-muted-foreground"}`}><Clock3 className="h-3 w-3" />{elapsed(order.createdAt, now)}</p></div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4 p-4">
                            <div className="space-y-3">
                              {order.items.map((item) => <div key={item.id}><p className="text-sm font-semibold">{item.quantity} × {item.name}</p>{item.modifiers?.map((modifier) => <p key={modifier} className="ml-4 text-xs text-muted-foreground">• {modifier}</p>)}{item.notes ? <p className="ml-4 text-xs font-medium text-amber-700">Nota: {item.notes}</p> : null}</div>)}
                            </div>
                            {order.notes ? <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{order.notes}</p> : null}
                            {nextStatus ? <Button className="w-full rounded-xl" disabled={updatingId === order.id} onClick={() => void advance(order)}>{updatingId === order.id ? "Actualizando..." : getStatusActionLabel(nextStatus)}</Button> : null}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
