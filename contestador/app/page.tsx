"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StatCard } from "@/components/dashboard/stat-card"
import { StatusBadge, CallStatusBadge } from "@/components/dashboard/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Package,
  ChefHat,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  PhoneCall,
  PhoneMissed,
  ArrowRight,
  Phone,
  MapPin,
  ShoppingCart,
} from "lucide-react"
import { listCalls, listOrders } from "@/lib/api"
import type { CallLog, Order } from "@/lib/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import Link from "next/link"

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function isSameDay(dateString: string) {
  const source = new Date(dateString)
  const now = new Date()
  return source.toDateString() === now.toDateString()
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [calls, setCalls] = useState<CallLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let active = true
    let firstLoad = true

    async function loadDashboard() {
      try {
        if (firstLoad) setIsLoading(true)
        setErrorMessage("")
        const [ordersData, callsData] = await Promise.all([listOrders(), listCalls()])
        if (active) {
          setOrders(ordersData)
          setCalls(callsData)
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el dashboard.")
        }
      } finally {
        if (active) setIsLoading(false)
        firstLoad = false
      }
    }

    void loadDashboard()
    const poller = window.setInterval(() => void loadDashboard(), 3000)
    return () => {
      active = false
      window.clearInterval(poller)
    }
  }, [])

  const stats = useMemo(() => {
    const deliveredToday = orders.filter((order) =>
      order.statusHistory.some((change) => change.status === "delivered" && isSameDay(change.timestamp))
    ).length
    const cancelledToday = orders.filter((order) =>
      order.statusHistory.some((change) => change.status === "cancelled" && isSameDay(change.timestamp))
    ).length

    return {
      newOrders: orders.filter((order) => order.status === "new").length,
      inPreparation: orders.filter((order) => order.status === "preparing").length,
      readyForPickup: orders.filter((order) => order.status === "ready").length,
      outForDelivery: orders.filter((order) => order.status === "out_for_delivery").length,
      deliveredToday,
      cancelledToday,
      callsConverted: calls.filter((call) => call.resultedInOrder).length,
      failedCalls: calls.filter((call) => call.status === "failed").length,
    }
  }, [orders, calls])

  const chartOrdersByDay = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      const key = date.toISOString().slice(0, 10)
      return {
        key,
        day: date.toLocaleDateString("es-MX", { weekday: "short" }),
        orders: 0,
      }
    })

    for (const order of orders) {
      const key = new Date(order.createdAt).toISOString().slice(0, 10)
      const bucket = days.find((item) => item.key === key)
      if (bucket) bucket.orders += 1
    }

    return days
  }, [orders])

  const chartPeakHours = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour.toString().padStart(2, "0")}:00`,
      calls: 0,
    }))

    for (const call of calls) {
      const hour = new Date(call.startTime).getHours()
      if (hours[hour]) hours[hour].calls += 1
    }

    return hours
  }, [calls])

  const rankedProducts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const order of orders) {
      for (const item of order.items) {
        counts.set(item.name, (counts.get(item.name) || 0) + item.quantity)
      }
    }

    return Array.from(counts.entries())
      .map(([name, quantity]) => ({ name, orders: quantity }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5)
  }, [orders])

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5),
    [orders]
  )
  const recentCalls = useMemo(
    () => [...calls].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)).slice(0, 5),
    [calls]
  )
  const activeCarts = useMemo(
    () => calls.filter((call) =>
      ["connecting", "active", "transferring"].includes(call.sessionState)
      && !call.resultedInOrder
      && Boolean(call.draftCart?.items.length)
    ),
    [calls]
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inicio</h1>
          <p className="text-sm text-muted-foreground">
            Resumen de pedidos, cocina y actividad de llamadas.
          </p>
        </div>

        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Pedidos nuevos"
            value={isLoading ? "..." : stats.newOrders}
            icon={Package}
            helperText="Pendientes por confirmar"
            iconClassName="bg-blue-50"
          />
          <StatCard
            title="En preparación"
            value={isLoading ? "..." : stats.inPreparation}
            icon={ChefHat}
            iconClassName="bg-amber-50"
          />
          <StatCard
            title="Listos para recoger"
            value={isLoading ? "..." : stats.readyForPickup}
            icon={Clock}
            iconClassName="bg-emerald-50"
          />
          <StatCard
            title="En camino"
            value={isLoading ? "..." : stats.outForDelivery}
            icon={Truck}
            iconClassName="bg-violet-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Entregados hoy"
            value={isLoading ? "..." : stats.deliveredToday}
            icon={CheckCircle}
            helperText="Con estatus final de hoy"
            iconClassName="bg-green-50"
          />
          <StatCard
            title="Cancelados hoy"
            value={isLoading ? "..." : stats.cancelledToday}
            icon={XCircle}
            iconClassName="bg-red-50"
          />
          <StatCard
            title="Llamadas convertidas"
            value={isLoading ? "..." : stats.callsConverted}
            icon={PhoneCall}
            helperText="Llamadas que terminaron en pedido"
            iconClassName="bg-accent/10"
          />
          <StatCard
            title="Llamadas fallidas"
            value={isLoading ? "..." : stats.failedCalls}
            icon={PhoneMissed}
            iconClassName="bg-slate-100"
          />
        </div>

        {activeCarts.length ? (
          <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base font-medium">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-600" />
                </span>
                Carritos en llamadas activas
              </CardTitle>
              <span className="shrink-0 text-xs font-medium text-blue-700">Actualiza cada 3 s</span>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {activeCarts.map((call) => {
                const items = call.draftCart?.items ?? []
                const estimatedTotal = call.draftCart?.quote?.total
                  ?? items.reduce((total, item) => total + item.lineTotal, 0)
                return (
                  <div key={call.id} className="min-w-0 rounded-xl border border-blue-200 bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                          <ShoppingCart className="h-4 w-4 text-blue-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{call.phoneNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {items.reduce((total, item) => total + item.quantity, 0)} productos · ${estimatedTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">
                        {call.sessionState === "transferring" ? "Transfiriendo" : "En llamada"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 border-t border-blue-100 pt-3">
                      {items.map((item) => (
                        <p key={item.lineId} className="truncate text-xs text-muted-foreground">
                          {item.quantity}× {item.name}
                          {item.modifiers.length ? ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Orders by Day */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Pedidos de esta semana</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartOrdersByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
                    />
                    <Bar 
                      dataKey="orders" 
                      fill="hsl(var(--primary))" 
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Peak Ordering Hours */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Horas pico de pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartPeakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="hour" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      interval={1}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="calls"
                      stroke="hsl(var(--accent))"
                      fill="hsl(var(--accent))"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Productos más pedidos</CardTitle>
          </CardHeader>
            <CardContent>
              <div className="space-y-4">
              {rankedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay productos ordenados.</p>
              ) : rankedProducts.map((product, index) => (
                <div key={product.name} className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden hidden sm:block">
                      <div 
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(product.orders / rankedProducts[0].orders) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-16 text-right">
                      {product.orders} pedidos
                    </span>
                  </div>
                </div>
              ))}
              </div>
            </CardContent>
          </Card>

        {/* Recent Activity Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Orders */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Pedidos recientes</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/orders">
                  Ver todo <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                      {order.type === "delivery" ? (
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {order.folio}
                        </p>
                        <StatusBadge status={order.status} size="sm" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {order.customerName} • ${order.total}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        {formatTime(order.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Calls */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Actividad reciente de llamadas</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/logs">
                  Ver todo <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      call.resultedInOrder ? "bg-green-50" : "bg-secondary"
                    }`}>
                      <Phone className={`h-5 w-5 ${
                        call.resultedInOrder ? "text-green-600" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {call.phoneNumber}
                        </p>
                        <CallStatusBadge status={call.status} size="sm" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {call.aiSummary}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-medium text-foreground">
                        {formatDuration(call.duration)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(call.startTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
