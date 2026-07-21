"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { CallStatusBadge } from "@/components/dashboard/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listCalls } from "@/lib/api"
import type { CallLog } from "@/lib/types"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ChevronRight,
  Clock,
  Code,
  FileText,
  Filter,
  Phone,
  Search,
  XCircle,
} from "lucide-react"

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("es-MX", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function formatErrorFlag(flag: string) {
  return flag.replaceAll("_", " ")
}

export default function LogsPage() {
  const [logs, setLogs] = useState<CallLog[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let active = true
    let firstLoad = true

    async function loadCalls() {
      try {
        if (firstLoad) setIsLoading(true)
        setErrorMessage("")
        const data = await listCalls()
        if (active) {
          setLogs(data)
          setSelectedLog((current) =>
            current ? data.find((item) => item.id === current.id) ?? current : null
          )
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar las llamadas.")
        }
      } finally {
        if (active) setIsLoading(false)
        firstLoad = false
      }
    }

    void loadCalls()
    const poller = window.setInterval(() => void loadCalls(), 3000)
    return () => {
      active = false
      window.clearInterval(poller)
    }
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = searchQuery === "" || log.phoneNumber.includes(searchQuery)
      const matchesStatus = statusFilter === "all" || log.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [logs, searchQuery, statusFilter])

  const stats = useMemo(() => {
    const total = logs.length
    const converted = logs.filter((log) => log.resultedInOrder).length
    const avgDuration = total ? logs.reduce((sum, log) => sum + log.duration, 0) / total : 0
    const confidentLogs = logs.filter((log) => log.confidence > 0)
    const avgConfidence = confidentLogs.length
      ? confidentLogs.reduce((sum, log) => sum + log.confidence, 0) / confidentLogs.length
      : 0

    return {
      total,
      converted,
      avgDuration,
      avgConfidence,
    }
  }, [logs])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Registro de llamadas</h1>
          <p className="text-sm text-muted-foreground">
            Vista interna del procesamiento de llamadas por IA.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Llamadas totales</p>
                  <p className="text-2xl font-semibold">{stats.total}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Conversión a pedido</p>
                  <p className="text-2xl font-semibold">
                    {stats.total ? Math.round((stats.converted / stats.total) * 100) : 0}%
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Duración promedio</p>
                  <p className="text-2xl font-semibold">{formatDuration(Math.round(stats.avgDuration))}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border py-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Confianza promedio</p>
                  <p className="text-2xl font-semibold">{Math.round(stats.avgConfidence * 100)}%</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <Activity className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número telefónico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full rounded-xl sm:w-[200px]">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Filtrar estatus" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg">Todas</SelectItem>
              <SelectItem value="completed" className="rounded-lg">Completadas</SelectItem>
              <SelectItem value="failed" className="rounded-lg">Fallidas</SelectItem>
              <SelectItem value="dropped" className="rounded-lg">Interrumpidas</SelectItem>
              <SelectItem value="incomplete" className="rounded-lg">Incompletas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 xl:hidden">
          {isLoading ? (
            <Card className="gap-0 border-border py-0">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Cargando llamadas...
              </CardContent>
            </Card>
          ) : filteredLogs.length === 0 ? (
            <Card className="gap-0 border-border py-0">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No hay llamadas para mostrar.
              </CardContent>
            </Card>
          ) : (
            filteredLogs.map((log) => (
              <Card
                key={log.id}
                className="cursor-pointer gap-0 border-border py-0 shadow-sm"
                onClick={() => {
                  setSelectedLog(log)
                  setDrawerOpen(true)
                }}
              >
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-semibold text-foreground">{log.phoneNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(log.startTime)} · {formatTime(log.startTime)}
                      </p>
                    </div>
                    <CallStatusBadge status={log.status} size="sm" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-secondary/35 p-3 text-center">
                    <div className="min-w-0">
                      <p className="font-semibold">{formatDuration(log.duration)}</p>
                      <p className="text-xs text-muted-foreground">Duración</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{Math.round(log.confidence * 100)}%</p>
                      <p className="text-xs text-muted-foreground">Confianza</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{log.resultedInOrder ? "Sí" : "No"}</p>
                      <p className="text-xs text-muted-foreground">Pedido</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    {log.errorFlags?.length ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {log.errorFlags.length} errores
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin errores</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedLog(log)
                        setDrawerOpen(true)
                      }}
                    >
                      Detalles
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card className="hidden gap-0 border-border py-0 shadow-sm xl:flex">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Teléfono</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead>Errores</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Cargando llamadas...
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No hay llamadas para mostrar.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedLog(log)
                        setDrawerOpen(true)
                      }}
                    >
                      <TableCell className="font-medium">{log.phoneNumber}</TableCell>
                      <TableCell>
                        <div className="text-sm">{formatTime(log.startTime)}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(log.startTime)}</div>
                      </TableCell>
                      <TableCell>{formatDuration(log.duration)}</TableCell>
                      <TableCell>
                        <CallStatusBadge status={log.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        {log.resultedInOrder ? (
                          <Badge className="border-green-200 bg-green-50 text-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Sí
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">
                            <XCircle className="mr-1 h-3 w-3" />
                            No
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={log.confidence * 100} className="h-2 w-16" />
                          <span className="text-xs text-muted-foreground">
                            {Math.round(log.confidence * 100)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.errorFlags?.length ? (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {log.errorFlags.length}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Ninguno</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedLog(log)
                            setDrawerOpen(true)
                          }}
                        >
                          Detalles
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
          {selectedLog ? (
            <>
              <SheetHeader className="shrink-0 border-b border-border p-4 pr-14 sm:p-6 sm:pr-16">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        selectedLog.resultedInOrder ? "bg-green-50" : "bg-secondary"
                      }`}
                    >
                      <Phone
                        className={`h-6 w-6 ${
                          selectedLog.resultedInOrder ? "text-green-600" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="break-all text-lg font-semibold">
                        {selectedLog.phoneNumber}
                      </SheetTitle>
                      <SheetDescription className="sr-only">
                        Detalle interno de la llamada seleccionada.
                      </SheetDescription>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(selectedLog.startTime)} a las {formatTime(selectedLog.startTime)}
                      </p>
                    </div>
                  </div>
                  <CallStatusBadge status={selectedLog.status} />
                </div>
              </SheetHeader>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="text-lg font-semibold">{formatDuration(selectedLog.duration)}</p>
                      <p className="text-xs text-muted-foreground">Duración</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="text-lg font-semibold">{Math.round(selectedLog.confidence * 100)}%</p>
                      <p className="text-xs text-muted-foreground">Confianza</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-secondary/50 p-3 text-center sm:p-4">
                      <p className="text-lg font-semibold">{selectedLog.toolCalls?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Herramientas</p>
                    </div>
                  </div>

                  {selectedLog.draftCart?.items.length ? (
                    <Card className="border-blue-200 bg-blue-50/40">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between gap-3 text-sm font-medium">
                          <span>Carrito preliminar</span>
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] text-blue-700">
                            {selectedLog.sessionState === "active" ? "En vivo" : selectedLog.sessionState}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {selectedLog.draftCart.items.map((item) => (
                          <div key={item.lineId} className="flex items-start justify-between gap-4 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium">{item.quantity}× {item.name}</p>
                              {item.modifiers.length ? (
                                <p className="break-words text-xs text-muted-foreground">
                                  {item.modifiers.map((modifier) => modifier.name).join(", ")}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 font-medium">${item.lineTotal.toFixed(2)}</span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span>{selectedLog.draftCart.quote ? "Total cotizado" : "Subtotal estimado"}</span>
                          <span>
                            ${(selectedLog.draftCart.quote?.total
                              ?? selectedLog.draftCart.items.reduce((total, item) => total + item.lineTotal, 0)
                            ).toFixed(2)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {selectedLog.aiSummary ? (
                    <Card className="border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          Resumen de IA
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground">{selectedLog.aiSummary}</p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {selectedLog.errorFlags?.length ? (
                    <Card className="border-destructive/30 bg-destructive/5">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          Indicadores de error
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-2">
                          {selectedLog.errorFlags.map((flag) => (
                            <Badge key={flag} variant="destructive" className="text-xs">
                              {formatErrorFlag(flag)}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {selectedLog.toolCalls?.length ? (
                    <Card className="border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                          <Code className="h-4 w-4" />
                          Llamadas a herramientas
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {selectedLog.toolCalls.map((tool, index) => (
                            <div
                              key={`${tool}-${index}`}
                              className="flex items-center gap-3 rounded-lg border border-border p-3 font-mono text-xs"
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-muted-foreground">
                                {index + 1}
                              </span>
                              <span className="min-w-0 break-all text-foreground">{tool}()</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {selectedLog.transcript ? (
                    <Card className="border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          Transcripción
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="rounded-lg bg-secondary/30 p-4">
                          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {selectedLog.transcript}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Metadatos de la llamada</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                          <span className="text-muted-foreground">ID de llamada</span>
                          <span className="break-all text-right font-mono">{selectedLog.id}</span>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                          <span className="text-muted-foreground">Hora de inicio</span>
                          <span className="text-right">{formatTime(selectedLog.startTime)}</span>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                          <span className="text-muted-foreground">Duración</span>
                          <span className="text-right">{formatDuration(selectedLog.duration)}</span>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                          <span className="text-muted-foreground">Generó pedido</span>
                          <span className="text-right">{selectedLog.resultedInOrder ? "Sí" : "No"}</span>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                          <span className="text-muted-foreground">Sesión de voz</span>
                          <span className="break-all text-right">{selectedLog.sessionState}</span>
                        </div>
                        {selectedLog.orderId ? (
                          <>
                            <Separator />
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                              <span className="text-muted-foreground">ID del pedido</span>
                              <span className="break-all text-right font-mono">{selectedLog.orderId}</span>
                            </div>
                          </>
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
