"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { getBusinessSettings, listMenuRules, updateBusinessSettings, updateMenuRule } from "@/lib/api"
import {
  AlertCircle,
  Clock,
  CreditCard,
  DollarSign,
  Package,
  Save,
  Settings2,
  Truck,
} from "lucide-react"

type RuleItem = {
  id: string
  name: string
  type: "time_restriction" | "delivery_rule" | "combo_rule" | "modifier_rule" | "payment_rule"
  description: string
  isActive: boolean
  config: Record<string, unknown>
}

const typeLabels: Record<RuleItem["type"], string> = {
  time_restriction: "Horario",
  delivery_rule: "Entrega",
  combo_rule: "Combos",
  modifier_rule: "Modificadores",
  payment_rule: "Pago",
}

export default function RulesPage() {
  const [rules, setRules] = useState<RuleItem[]>([])
  const [deliverySettings, setDeliverySettings] = useState({
    minimumOrder: 0,
    deliveryFee: 0,
    freeDeliveryThreshold: 0,
    estimatedPrepTime: 0,
    deliveryEnabled: true,
  })
  const [paymentSettings, setPaymentSettings] = useState({
    acceptCash: true,
    acceptCard: true,
    acceptOnline: true,
    cashOnlyThreshold: 0,
    requirePrepayment: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    async function loadRules() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const [settings, menuRules] = await Promise.all([
          getBusinessSettings(),
          listMenuRules(),
        ])

        setDeliverySettings({
          minimumOrder: Number(settings.minimum_order_delivery ?? 0),
          deliveryFee: Number(settings.delivery_fee ?? 0),
          freeDeliveryThreshold: Number(settings.free_delivery_threshold ?? 0),
          estimatedPrepTime: Number(settings.estimated_prep_time_minutes ?? 0),
          deliveryEnabled: settings.delivery_enabled,
        })

        setPaymentSettings({
          acceptCash: settings.accept_cash,
          acceptCard: settings.accept_card,
          acceptOnline: settings.accept_online,
          cashOnlyThreshold: Number(settings.cash_only_threshold ?? 0),
          requirePrepayment: settings.require_prepayment,
        })

        setRules(menuRules)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadRules()
  }, [])

  const saveSettings = async () => {
    try {
      await updateBusinessSettings({
        delivery_enabled: deliverySettings.deliveryEnabled,
        minimum_order_delivery: deliverySettings.minimumOrder,
        delivery_fee: deliverySettings.deliveryFee,
        free_delivery_threshold: deliverySettings.freeDeliveryThreshold,
        estimated_prep_time_minutes: deliverySettings.estimatedPrepTime,
        accept_cash: paymentSettings.acceptCash,
        accept_card: paymentSettings.acceptCard,
        accept_online: paymentSettings.acceptOnline,
        cash_only_threshold: paymentSettings.cashOnlyThreshold,
        require_prepayment: paymentSettings.requirePrepayment,
      })
      setSuccessMessage("Reglas operativas actualizadas.")
      window.setTimeout(() => setSuccessMessage(""), 2500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.")
    }
  }

  const toggleRule = async (ruleId: string) => {
    const currentRule = rules.find((rule) => rule.id === ruleId)
    if (!currentRule) return

    try {
      await updateMenuRule(ruleId, { isActive: !currentRule.isActive })
      setRules((current) =>
        current.map((rule) =>
          rule.id === ruleId ? { ...rule, isActive: !rule.isActive } : rule
        )
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar la regla.")
    }
  }

  const getRuleIcon = (type: RuleItem["type"]) => {
    switch (type) {
      case "time_restriction":
        return Clock
      case "delivery_rule":
        return Truck
      case "combo_rule":
        return Package
      case "payment_rule":
        return CreditCard
      default:
        return Settings2
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reglas del menú</h1>
            <p className="text-sm text-muted-foreground">
              Configura pagos, entrega y reglas especiales que afectan cómo toma pedidos el asistente.
            </p>
          </div>
          <Button className="rounded-xl" onClick={() => void saveSettings()}>
            <Save className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </div>

        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        {successMessage ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="py-4 text-sm text-emerald-700">{successMessage}</CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Cargando reglas del negocio...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                      <Truck className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Opciones de entrega</CardTitle>
                      <CardDescription className="text-xs">
                        Costos, mínimos y tiempos de preparación
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div className="min-w-0 space-y-0.5">
                      <Label className="text-sm font-medium">Habilitar entrega</Label>
                      <p className="text-xs text-muted-foreground">
                        Permite pedidos a domicilio.
                      </p>
                    </div>
                    <Switch
                      checked={deliverySettings.deliveryEnabled}
                      onCheckedChange={(checked) =>
                        setDeliverySettings({ ...deliverySettings, deliveryEnabled: checked })
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="minOrder">Pedido mínimo</Label>
                      <Input
                        id="minOrder"
                        type="number"
                        value={deliverySettings.minimumOrder}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            minimumOrder: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deliveryFee">Costo de envío</Label>
                      <Input
                        id="deliveryFee"
                        type="number"
                        value={deliverySettings.deliveryFee}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            deliveryFee: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="freeDelivery">Envío gratis a partir de</Label>
                      <Input
                        id="freeDelivery"
                        type="number"
                        value={deliverySettings.freeDeliveryThreshold}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            freeDeliveryThreshold: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prepTime">Tiempo de preparación (min)</Label>
                      <Input
                        id="prepTime"
                        type="number"
                        value={deliverySettings.estimatedPrepTime}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            estimatedPrepTime: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                      <CreditCard className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Opciones de pago</CardTitle>
                      <CardDescription className="text-xs">
                        Métodos aceptados y restricciones
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-border p-3">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Efectivo</span>
                      </div>
                      <Switch
                        checked={paymentSettings.acceptCash}
                        onCheckedChange={(checked) =>
                          setPaymentSettings({ ...paymentSettings, acceptCash: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border p-3">
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Tarjeta</span>
                      </div>
                      <Switch
                        checked={paymentSettings.acceptCard}
                        onCheckedChange={(checked) =>
                          setPaymentSettings({ ...paymentSettings, acceptCard: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border p-3">
                      <div className="flex items-center gap-3">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Pago en línea</span>
                      </div>
                      <Switch
                        checked={paymentSettings.acceptOnline}
                        onCheckedChange={(checked) =>
                          setPaymentSettings({ ...paymentSettings, acceptOnline: checked })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="cashThreshold">Solo efectivo para pedidos arriba de</Label>
                    <Input
                      id="cashThreshold"
                      type="number"
                      value={paymentSettings.cashOnlyThreshold}
                      onChange={(e) =>
                        setPaymentSettings({
                          ...paymentSettings,
                          cashOnlyThreshold: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Requerir prepago</p>
                      <p className="text-xs text-muted-foreground">
                        Úsalo cuando quieras cobrar antes de confirmar.
                      </p>
                    </div>
                    <Switch
                      checked={paymentSettings.requirePrepayment}
                      onCheckedChange={(checked) =>
                        setPaymentSettings({ ...paymentSettings, requirePrepayment: checked })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                    <Settings2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Reglas activas</CardTitle>
                    <CardDescription className="text-xs">
                      Reglas especiales definidas en el backend
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {rules.map((rule) => {
                    const Icon = getRuleIcon(rule.type)

                    return (
                      <AccordionItem key={rule.id} value={rule.id} className="border-border">
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex items-center gap-3 text-left">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{rule.name}</span>
                                <Badge
                                  variant={rule.isActive ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {rule.isActive ? "Activa" : "Inactiva"}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {typeLabels[rule.type]}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 pt-2">
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{rule.description}</p>
                            <div className="flex items-center justify-between rounded-xl border border-border p-3">
                              <span className="text-sm font-medium">Habilitar regla</span>
                              <Switch
                                checked={rule.isActive}
                                onCheckedChange={() => void toggleRule(rule.id)}
                              />
                            </div>
                            <div className="rounded-xl bg-secondary/50 p-3">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">Configuración</p>
                              <pre className="overflow-auto text-xs text-foreground">
                                {JSON.stringify(rule.config, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-4 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Estas reglas afectan cómo toma pedidos la IA
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Cualquier cambio aquí modifica cómo se validan pedidos, pagos y entregas en llamadas reales.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
