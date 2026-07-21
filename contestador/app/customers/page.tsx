"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { listCustomers } from "@/lib/api"
import type { PhoneCustomer } from "@/lib/types"
import {
  ArrowUpRight,
  Calendar,
  DollarSign,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  TrendingUp,
  User,
} from "lucide-react"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("es-MX", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<PhoneCustomer[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<PhoneCustomer | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function loadCustomers() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const data = await listCustomers()
        setCustomers(data)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar los clientes.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadCustomers()
  }, [])

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const normalizedQuery = searchQuery.toLowerCase()
      return (
        customer.phoneNumber.includes(searchQuery) ||
        customer.customerName.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [customers, searchQuery])

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => b.totalOrders - a.totalOrders)
  }, [filteredCustomers])

  const totalCustomers = customers.length
  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0)
  const totalOrders = customers.reduce((sum, customer) => sum + customer.totalOrders, 0)
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Historial de clientes agrupado por teléfono con datos reales del backend.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Clientes únicos</p>
                  <p className="text-2xl font-semibold">{totalCustomers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ingresos acumulados</p>
                  <p className="text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                  <TrendingUp className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ticket promedio</p>
                  <p className="text-2xl font-semibold">{formatCurrency(Math.round(avgOrderValue))}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>

        <div className="grid gap-4">
          {isLoading ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Phone className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Cargando clientes...</p>
              </CardContent>
            </Card>
          ) : sortedCustomers.length === 0 ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Phone className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No se encontraron clientes.</p>
              </CardContent>
            </Card>
          ) : (
            sortedCustomers.map((customer) => (
              <Card
                key={customer.id}
                className="cursor-pointer gap-0 border-border py-0 shadow-sm transition-all duration-200 hover:shadow-md"
                onClick={() => {
                  setSelectedCustomer(customer)
                  setDrawerOpen(true)
                }}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
                        <Phone className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{customer.customerName}</p>
                        <p className="text-sm text-muted-foreground">{customer.phoneNumber}</p>
                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Última actividad: {customer.lastActivityDate ? formatDate(customer.lastActivityDate) : "Sin actividad"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
                      <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">{customer.totalOrders}</p>
                        <p className="text-xs text-muted-foreground">Pedidos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">{formatCurrency(customer.totalSpent)}</p>
                        <p className="text-xs text-muted-foreground">Gastado</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                          {formatCurrency(customer.averageOrderValue)}
                        </p>
                        <p className="text-xs text-muted-foreground">Promedio</p>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" className="shrink-0 rounded-xl">
                      Ver detalle
                      <ArrowUpRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Favoritos:</span>
                      {customer.mostOrderedItems.slice(0, 3).map((item) => (
                        <Badge key={item} variant="secondary" className="text-xs">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          {selectedCustomer ? (
            <>
              <SheetHeader className="shrink-0 border-b border-border p-4 pr-14 sm:p-6 sm:pr-16">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary sm:h-14 sm:w-14">
                    <Phone className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-lg font-semibold">
                      {selectedCustomer.customerName}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                      Historial completo del cliente seleccionado.
                    </SheetDescription>
                    <p className="break-words text-sm text-muted-foreground">
                      {selectedCustomer.phoneNumber} · {selectedCustomer.totalCalls} llamadas
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="text-xl font-semibold sm:text-2xl">{selectedCustomer.totalOrders}</p>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="truncate text-base font-semibold sm:text-xl">{formatCurrency(selectedCustomer.totalSpent)}</p>
                      <p className="text-xs text-muted-foreground">Gastado</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="truncate text-base font-semibold sm:text-xl">{formatCurrency(selectedCustomer.averageOrderValue)}</p>
                      <p className="text-xs text-muted-foreground">Promedio</p>
                    </div>
                  </div>

                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <ShoppingBag className="h-4 w-4" />
                        Productos más pedidos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {selectedCustomer.mostOrderedItems.map((item, index) => (
                          <div key={item} className="flex items-center gap-3">
                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs font-medium">
                              {index + 1}
                            </div>
                            <span className="text-sm">{item}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {selectedCustomer.addresses.length ? (
                    <Card className="border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                          <MapPin className="h-4 w-4" />
                          Direcciones de entrega
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {selectedCustomer.addresses.map((address) => (
                            <div key={address} className="rounded-lg border border-border p-3">
                              <p className="text-sm text-muted-foreground">{address}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="h-4 w-4" />
                        Pedidos recientes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {selectedCustomer.orderHistory.slice(0, 5).map((order) => (
                          <div
                            key={order.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{order.folio}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{formatCurrency(order.total)}</p>
                              <Badge variant="outline" className="text-xs">
                                {order.type === "delivery" ? "Entrega" : "Recoger"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        {selectedCustomer.orderHistory.length === 0 ? (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            No hay pedidos recientes.
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  )
}
