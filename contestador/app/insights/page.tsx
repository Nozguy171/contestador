"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { getBusinessInsights, getBusinessSettings, updateBusinessSettings } from "@/lib/api"
import type { BusinessInsights } from "@/lib/types"
import { ArrowRight, BarChart3, Boxes, BrainCircuit, Lightbulb, ShieldCheck, Sparkles } from "lucide-react"

export default function InsightsPage() {
  const [data, setData] = useState<BusinessInsights | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  async function load() {
    try {
      setErrorMessage("")
      const [settings, insights] = await Promise.all([getBusinessSettings(), getBusinessInsights()])
      setEnabled(Boolean(settings.insights_enabled))
      setData(insights)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron calcular las recomendaciones.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function toggle(next: boolean) {
    try {
      setIsSaving(true)
      setErrorMessage("")
      await updateBusinessSettings({ insights_enabled: next })
      setEnabled(next)
      const insights = await getBusinessInsights()
      setData(insights)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cambiar el módulo.")
    } finally {
      setIsSaving(false)
    }
  }

  const maxRevenue = useMemo(() => Math.max(1, ...(data?.sales_by_weekday.map((item) => item.average_revenue) ?? [1])), [data])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><Sparkles className="h-4 w-4" />Módulo opcional</div>
            <h1 className="text-2xl font-semibold tracking-tight">Recomendaciones inteligentes</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Detecta días flojos y estima compras de inventario con el historial real de tu negocio.</p>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 shadow-sm sm:min-w-64"><span><span className="block text-sm font-medium">Análisis inteligente</span><span className="text-xs text-muted-foreground">{enabled ? "Activo" : "Desactivado"}</span></span><Switch checked={enabled} disabled={isSaving || isLoading} onCheckedChange={(checked) => void toggle(checked)} /></label>
        </div>

        {errorMessage ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}

        {isLoading ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Analizando información...</CardContent></Card> : !enabled ? (
          <Card className="overflow-hidden border-violet-200">
            <CardContent className="grid gap-8 bg-gradient-to-br from-violet-50 via-background to-emerald-50 p-6 sm:p-10 lg:grid-cols-[1fr_320px] lg:items-center">
              <div><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white"><BrainCircuit className="h-6 w-6" /></div><h2 className="text-xl font-semibold">Actívalo sólo si el cliente lo necesita</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Usa pedidos e historial de consumo para explicar cada recomendación. No cambia precios, no compra inventario y no crea promociones automáticamente.</p><Button className="mt-6 rounded-xl" disabled={isSaving} onClick={() => void toggle(true)}>Activar recomendaciones</Button></div>
              <div className="space-y-3 rounded-2xl border bg-background/80 p-5"><p className="text-sm font-semibold">Qué obtienes</p><p className="flex gap-2 text-sm text-muted-foreground"><BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />Comparación de venta promedio por día.</p><p className="flex gap-2 text-sm text-muted-foreground"><Boxes className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Compra sugerida para siete días con colchón.</p><p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />Aprobación humana antes de actuar.</p></div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {(data?.recommendations ?? []).map((item, index) => (
                <Card key={`${item.kind}-${index}`} className={item.kind === "learning" ? "border-dashed" : "border-violet-200"}>
                  <CardHeader><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50"><Lightbulb className="h-5 w-5 text-violet-700" /></div><Badge variant="secondary">{item.confidence === "high" ? "Confianza alta" : item.confidence === "medium" ? "Confianza media" : "Aprendiendo"}</Badge></div><CardTitle className="pt-2 text-lg">{item.title}</CardTitle><CardDescription className="leading-6">{item.message}</CardDescription></CardHeader><CardContent><Button asChild variant="outline" className="rounded-xl"><Link href={item.action_href}>Revisar <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-violet-600" />Venta promedio por día</CardTitle><CardDescription>Promedio diario de los últimos {data?.data_window_days ?? 56} días, sin pedidos cancelados. Muestra: {data?.sample_size ?? 0} pedidos.</CardDescription></CardHeader>
              <CardContent>
                {data?.sales_by_weekday.length ? <div className="space-y-4">{data.sales_by_weekday.map((item) => <div key={item.day_index} className="grid grid-cols-[72px_1fr_auto] items-center gap-3"><span className="text-sm font-medium">{item.day.slice(0, 3)}</span><div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(item.average_revenue > 0 ? 4 : 0, (item.average_revenue / maxRevenue) * 100)}%` }} /></div><div className="min-w-24 text-right"><p className="text-sm font-semibold">${item.average_revenue.toFixed(2)}</p><p className="text-xs text-muted-foreground">{item.average_orders} pedidos</p></div></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay pedidos suficientes para graficar.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Boxes className="h-5 w-5 text-emerald-600" />Compra sugerida de inventario</CardTitle><CardDescription>Proyección para siete días con 20% de colchón, usando consumos vinculados a pedidos de los últimos {data?.inventory_window_days ?? 28} días.</CardDescription></CardHeader>
              <CardContent>
                {data?.purchase_suggestions.length ? <div className="grid gap-3 md:grid-cols-2">{data.purchase_suggestions.map((item) => <div key={item.item_id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">Existencia: {item.current_quantity.toLocaleString()} {item.unit} · consumo diario: {item.average_daily_use.toLocaleString()}</p></div><Badge className="bg-emerald-600">Comprar {item.recommended_purchase.toLocaleString()}</Badge></div>{item.estimated_days_remaining != null ? <p className="mt-3 text-sm text-amber-700">Alcanza aproximadamente {item.estimated_days_remaining.toLocaleString()} días.</p> : null}</div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">No hay faltantes proyectados con los consumos registrados. Los productos sin receta no generan consumo automático.</p>}
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">Estas recomendaciones son estadísticas explicables, no decisiones automáticas. Revisa costos, caducidad y operación antes de aplicarlas.</p>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
