"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { getBusinessSettings, updateBusinessSettings } from "@/lib/api"
import { CreditCard, DollarSign, Save, ShieldCheck, Truck } from "lucide-react"

export default function RulesPage() {
  const [delivery, setDelivery] = useState({
    enabled: true,
    minimum: 0,
    fee: 0,
    freeThreshold: 0,
    prepMinutes: 0,
  })
  const [payment, setPayment] = useState({
    cash: true,
    card: true,
    online: true,
    cashOnlyThreshold: 0,
    requirePrepayment: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const settings = await getBusinessSettings()
        setDelivery({
          enabled: settings.delivery_enabled,
          minimum: Number(settings.minimum_order_delivery ?? 0),
          fee: Number(settings.delivery_fee ?? 0),
          freeThreshold: Number(settings.free_delivery_threshold ?? 0),
          prepMinutes: Number(settings.estimated_prep_time_minutes ?? 0),
        })
        setPayment({
          cash: settings.accept_cash,
          card: settings.accept_card,
          online: settings.accept_online,
          cashOnlyThreshold: Number(settings.cash_only_threshold ?? 0),
          requirePrepayment: settings.require_prepayment,
        })
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración.")
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  async function save() {
    if (!payment.cash && !payment.card && !payment.online) {
      setErrorMessage("Activa por lo menos un método de pago.")
      return
    }
    try {
      setIsSaving(true)
      setErrorMessage("")
      await updateBusinessSettings({
        delivery_enabled: delivery.enabled,
        minimum_order_delivery: delivery.minimum,
        delivery_fee: delivery.fee,
        free_delivery_threshold: delivery.freeThreshold,
        estimated_prep_time_minutes: delivery.prepMinutes,
        accept_cash: payment.cash,
        accept_card: payment.card,
        accept_online: payment.online,
        cash_only_threshold: payment.cashOnlyThreshold,
        require_prepayment: payment.requirePrepayment,
      })
      setSuccessMessage("Reglas de venta actualizadas.")
      window.setTimeout(() => setSuccessMessage(""), 2500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-semibold tracking-tight">Venta y entrega</h1><p className="text-sm text-muted-foreground">Reglas simples que el backend aplica igual en llamadas y POS.</p></div>
          <Button className="rounded-xl" disabled={isLoading || isSaving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{isSaving ? "Guardando..." : "Guardar"}</Button>
        </div>

        {errorMessage ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}
        {successMessage ? <Card className="border-emerald-200 bg-emerald-50"><CardContent className="py-4 text-sm text-emerald-700">{successMessage}</CardContent></Card> : null}

        {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando configuración...</CardContent></Card> : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-5 w-5 text-violet-600" />Entrega</CardTitle><CardDescription>Activa domicilio y define sus importes.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><p className="text-sm font-medium">Pedidos a domicilio</p><p className="text-xs text-muted-foreground">Si está apagado sólo se permite recoger.</p></div><Switch checked={delivery.enabled} onCheckedChange={(enabled) => setDelivery({ ...delivery, enabled })} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyField id="delivery-minimum" label="Pedido mínimo" value={delivery.minimum} onChange={(minimum) => setDelivery({ ...delivery, minimum })} />
                  <MoneyField id="delivery-fee" label="Costo de envío" value={delivery.fee} onChange={(fee) => setDelivery({ ...delivery, fee })} />
                  <MoneyField id="delivery-free" label="Envío gratis desde" value={delivery.freeThreshold} onChange={(freeThreshold) => setDelivery({ ...delivery, freeThreshold })} />
                  <div className="space-y-2"><Label htmlFor="prep-minutes">Preparación (minutos)</Label><Input id="prep-minutes" type="number" min="0" step="1" value={delivery.prepMinutes} onChange={(event) => setDelivery({ ...delivery, prepMinutes: Number(event.target.value) || 0 })} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-5 w-5 text-emerald-600" />Pagos</CardTitle><CardDescription>Muestra únicamente formas de pago realmente aceptadas.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <PaymentToggle label="Efectivo" checked={payment.cash} onChange={(cash) => setPayment({ ...payment, cash })} icon={<DollarSign className="h-4 w-4" />} />
                <PaymentToggle label="Tarjeta" checked={payment.card} onChange={(card) => setPayment({ ...payment, card })} icon={<CreditCard className="h-4 w-4" />} />
                <PaymentToggle label="Pago en línea" checked={payment.online} onChange={(online) => setPayment({ ...payment, online })} icon={<CreditCard className="h-4 w-4" />} />
                <Separator />
                <MoneyField id="cash-threshold" label="Sólo efectivo en pedidos desde" value={payment.cashOnlyThreshold} onChange={(cashOnlyThreshold) => setPayment({ ...payment, cashOnlyThreshold })} />
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><p className="text-sm font-medium">Requerir prepago</p><p className="text-xs text-muted-foreground">Impide confirmar pedidos en efectivo.</p></div><Switch checked={payment.requirePrepayment} onCheckedChange={(requirePrepayment) => setPayment({ ...payment, requirePrepayment })} /></div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50 lg:col-span-2"><CardContent className="flex items-start gap-3 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold">Estas reglas sí son autoritativas</p><p className="text-xs text-muted-foreground">El backend vuelve a calcular precios, mínimos, envío y pagos antes de guardar. Se retiró de esta pantalla el JSON técnico que no se aplicaba de forma confiable.</p></div></CardContent></Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} /></div>
}

function PaymentToggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between rounded-xl border border-border p-3"><div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">{icon}<span className="text-foreground">{label}</span></div><Switch checked={checked} onCheckedChange={onChange} /></div>
}
