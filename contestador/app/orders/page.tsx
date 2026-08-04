"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { OrderDetailDrawer } from "@/components/orders/order-detail-drawer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listOrders, updateOrderStatus } from "@/lib/api"
import { getNextOrderStatus, getStatusActionLabel, orderStatusMeta } from "@/lib/order-status"
import type { Order, OrderStatus } from "@/lib/types"
import { toast } from "sonner"
import {
  Search,
  MapPin,
  Package,
  Phone,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react"

const statusOptions: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Por confirmar" },
  { value: "confirmed", label: "Confirmados" },
  { value: "preparing", label: "En preparación" },
  { value: "ready", label: "Listos para recoger" },
  { value: "out_for_delivery", label: "En reparto" },
  { value: "delivered", label: "Entregados" },
  { value: "cancelled", label: "Cancelados" },
]

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("es-MX", {
    month: "short",
    day: "numeric",
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount)
}

function sourceLabel(source: Order["source"]) {
  return source === "voice" ? "Llamada" : source === "kiosk" ? "Autoservicio" : "POS"
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)

  useEffect(() => {
    async function loadOrders() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const data = await listOrders()
        setOrders(data)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar las órdenes.")
      } finally {
        setIsLoading(false)
      }
    }

    loadOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        searchQuery === "" ||
        order.folio.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.phoneNumber.includes(searchQuery) ||
        order.customerName.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === "all" || order.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [orders, searchQuery, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    orders.forEach((order) => {
      counts[order.status] = (counts[order.status] || 0) + 1
    })
    return counts
  }, [orders])

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setUpdatingId(orderId)
      setErrorMessage("")
      const updatedOrder = await updateOrderStatus(orderId, newStatus)
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? updatedOrder : order))
      )

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updatedOrder)
      }
      toast.success(`${updatedOrder.folio}: ${orderStatusMeta[newStatus].label}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el pedido."
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  const requestStatusChange = (order: Order, newStatus: OrderStatus) => {
    if (newStatus === "cancelled") {
      setCancelOrder(order)
      return
    }
    void handleStatusChange(order.id, newStatus)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Administra en un solo lugar los pedidos de llamadas, POS y autoservicio.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por folio, teléfono o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <p className="text-sm text-muted-foreground">Mostrando <span className="font-semibold text-foreground">{filteredOrders.length}</span> de {orders.length}</p>
        </div>

        {/* Status Quick Filters */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={statusFilter === option.value ? "default" : "outline"}
              size="sm"
              className="min-w-0 rounded-xl px-2 text-xs"
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
              <Badge 
                variant={statusFilter === option.value ? "secondary" : "outline"} 
                className="ml-2 text-xs"
              >
                {statusCounts[option.value] || 0}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Orders Grid */}
        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4">
          {isLoading ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-sm">Cargando órdenes...</p>
              </CardContent>
            </Card>
          ) : filteredOrders.length === 0 ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm font-medium text-foreground">{orders.length ? "No hay pedidos que coincidan" : "Todavía no hay pedidos"}</p>
                <p className="text-muted-foreground/70 text-xs mt-1">
                  {orders.length ? "Prueba ajustando el filtro o la búsqueda." : "Los pedidos de llamadas, POS y autoservicio aparecerán aquí."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => {
              const nextStatus = getNextOrderStatus(order)
              
              return (
                <Card
                  key={order.id}
                  className="cursor-pointer gap-0 border-border py-0 shadow-sm transition-all duration-200 hover:shadow-md"
                  onClick={() => {
                    setSelectedOrder(order)
                    setDrawerOpen(true)
                  }}
                >
                  <CardContent className="p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto_auto] lg:items-center">
                      {/* Order Info */}
                      <div className="col-span-2 flex min-w-0 items-start gap-3 lg:col-span-1 lg:gap-4">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${
                          order.type === "delivery" ? "bg-violet-50" : "bg-blue-50"
                        }`}>
                          {order.type === "delivery" ? (
                            <MapPin className="h-6 w-6 text-violet-600" />
                          ) : (
                            <Package className="h-6 w-6 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-semibold text-foreground">{order.folio}</span>
                            <StatusBadge status={order.status} size="sm" />
                            <Badge variant="outline" className="text-xs">
                              {order.type === "delivery" ? "Entrega" : "Recoger"}
                            </Badge>
                            <Badge variant={order.source === "voice" ? "default" : "secondary"} className="text-xs">
                              {sourceLabel(order.source)}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
                            <span className="min-w-0 truncate">{order.customerName}</span>
                            <span className="flex min-w-0 items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="break-all">{order.phoneNumber}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items Summary */}
                      <div className="col-span-2 min-w-0 rounded-xl bg-secondary/35 px-3 py-2 lg:col-span-1 lg:bg-transparent lg:p-0">
                        <p className="line-clamp-2 text-sm text-muted-foreground lg:truncate">
                          {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                        </p>
                      </div>

                      {/* Total & Time */}
                      <div className="border-t border-border pt-3 lg:border-0 lg:pt-0">
                        <div className="text-left lg:text-right">
                          <p className="font-semibold text-foreground">{formatCurrency(order.total)}</p>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(order.createdAt)} {formatTime(order.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2 border-t border-border pt-3 lg:border-0 lg:pt-0" onClick={(e) => e.stopPropagation()}>
                        {nextStatus && (
                          <Button
                            size="sm"
                            className="hidden rounded-xl sm:flex"
                            disabled={updatingId === order.id}
                            onClick={() => requestStatusChange(order, nextStatus)}
                          >
                            {updatingId === order.id ? "Actualizando..." : getStatusActionLabel(nextStatus)}
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-xl px-3 sm:size-9 sm:px-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sm:hidden">Acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem 
                              className="rounded-lg"
                              onClick={() => {
                                setSelectedOrder(order)
                                setDrawerOpen(true)
                              }}
                            >
                              Ver detalles
                            </DropdownMenuItem>
                          {nextStatus && (
                              <DropdownMenuItem 
                                className="rounded-lg sm:hidden"
                                onClick={() => requestStatusChange(order, nextStatus)}
                              >
                                {getStatusActionLabel(nextStatus)}
                              </DropdownMenuItem>
                            )}
                            {order.status !== "cancelled" && order.status !== "delivered" && (
                              <DropdownMenuItem 
                                className="rounded-lg text-destructive"
                                onClick={() => requestStatusChange(order, "cancelled")}
                              >
                                Cancelar pedido
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onStatusChange={(orderId, status) => {
          const order = orders.find((item) => item.id === orderId)
          if (order) requestStatusChange(order, status)
        }}
        isUpdating={updatingId === selectedOrder?.id}
      />

      <AlertDialog open={Boolean(cancelOrder)} onOpenChange={(open) => !open && setCancelOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar {cancelOrder?.folio}?</AlertDialogTitle>
            <AlertDialogDescription>El pedido quedará cerrado y, si ya consumió inventario, las existencias se devolverán automáticamente. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conservar pedido</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (cancelOrder) void handleStatusChange(cancelOrder.id, "cancelled")
              setCancelOrder(null)
            }}>Sí, cancelar pedido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
