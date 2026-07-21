"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { getBotConfig, getVoiceRuntime, updateBotConfig } from "@/lib/api"
import type { VoiceRuntimeStatus } from "@/lib/api"
import type { BotConfig } from "@/lib/types"
import {
  AlertTriangle,
  Bot,
  Lightbulb,
  MessageSquare,
  Moon,
  RotateCcw,
  Save,
  Sparkles,
  Volume2,
} from "lucide-react"

const defaultConfig: BotConfig = {
  welcomeMessage: "",
  afterHoursMessage: "",
  fallbackMessage: "",
  confirmationRequired: true,
  retryCount: 2,
  unavailableBehavior: "suggest_alternative",
  canSuggestAlternatives: true,
  tone: "friendly",
  specialInstructions: "",
}

export default function BotConfigPage() {
  const [config, setConfig] = useState<BotConfig>(defaultConfig)
  const [runtime, setRuntime] = useState<VoiceRuntimeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const [botConfig, voiceRuntime] = await Promise.all([
          getBotConfig(),
          getVoiceRuntime(),
        ])
        setConfig(botConfig)
        setRuntime(voiceRuntime)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración del bot.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadConfig()
  }, [])

  const handleSave = async () => {
    try {
      const updated = await updateBotConfig(config)
      setConfig(updated)
      setSuccessMessage("Configuración del bot guardada.")
      window.setTimeout(() => setSuccessMessage(""), 2500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración del bot.")
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configuración del bot</h1>
            <p className="text-sm text-muted-foreground">
              Ajusta cómo habla y cómo resuelve pedidos el asistente por voz.
            </p>
          </div>
          <Button className="rounded-xl" onClick={() => void handleSave()}>
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

        {runtime ? (
          <Card className={runtime.ready ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {runtime.ready ? "Telefonía lista para recibir llamadas" : "Falta configurar la telefonía"}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {runtime.twilio.inbound_url ?? "Configura PUBLIC_BASE_URL y credenciales en el backend."}
                </p>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                <p>Audio: Twilio Media Streams ↔ Gemini Live</p>
                <p>Gemini: {runtime.gemini.model}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Cargando configuración del bot...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                      <MessageSquare className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Mensaje de bienvenida</CardTitle>
                      <CardDescription className="text-xs">Saludo al contestar llamadas</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.welcomeMessage}
                    onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                    className="min-h-[110px] rounded-xl"
                    placeholder="Escribe el mensaje de bienvenida..."
                  />
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                      <Moon className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Mensaje fuera de horario</CardTitle>
                      <CardDescription className="text-xs">Se usa cuando el negocio está cerrado</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.afterHoursMessage}
                    onChange={(e) => setConfig({ ...config, afterHoursMessage: e.target.value })}
                    className="min-h-[110px] rounded-xl"
                    placeholder="Escribe el mensaje fuera de horario..."
                  />
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Mensaje de respaldo</CardTitle>
                      <CardDescription className="text-xs">Cuando el bot no entiende al cliente</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.fallbackMessage}
                    onChange={(e) => setConfig({ ...config, fallbackMessage: e.target.value })}
                    className="min-h-[110px] rounded-xl"
                    placeholder="Escribe el mensaje de respaldo..."
                  />
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                      <Sparkles className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Instrucciones especiales</CardTitle>
                      <CardDescription className="text-xs">Reglas extra durante la conversación</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.specialInstructions}
                    onChange={(e) => setConfig({ ...config, specialInstructions: e.target.value })}
                    className="min-h-[110px] rounded-xl"
                    placeholder="Escribe instrucciones especiales para el bot..."
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                    <Bot className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Comportamiento</CardTitle>
                    <CardDescription className="text-xs">Cómo toma decisiones el asistente</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div className="min-w-0 space-y-0.5">
                      <Label className="text-sm font-medium">Confirmación de pedido</Label>
                      <p className="text-xs text-muted-foreground">
                        Pide confirmación antes de cerrar el pedido.
                      </p>
                    </div>
                    <Switch
                      checked={config.confirmationRequired}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, confirmationRequired: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div className="min-w-0 space-y-0.5">
                      <Label className="text-sm font-medium">Sugerir alternativas</Label>
                      <p className="text-xs text-muted-foreground">
                        Puede sugerir productos parecidos cuando uno no esté disponible.
                      </p>
                    </div>
                    <Switch
                      checked={config.canSuggestAlternatives}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, canSuggestAlternatives: checked })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                        Intentos de reintento
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Cuántas veces vuelve a intentar si no entiende al cliente.
                      </p>
                    </div>
                    <span className="text-lg font-semibold">{config.retryCount}</span>
                  </div>
                  <Slider
                    value={[config.retryCount]}
                    onValueChange={([value]) => setConfig({ ...config, retryCount: value })}
                    max={5}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    Cuando un producto no está disponible
                  </Label>
                  <RadioGroup
                    value={config.unavailableBehavior}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        unavailableBehavior: value as BotConfig["unavailableBehavior"],
                      })
                    }
                    className="grid gap-3"
                  >
                    <div className="flex items-center space-x-3 rounded-xl border border-border p-4">
                      <RadioGroupItem value="skip" id="skip" />
                      <div className="flex-1">
                        <Label htmlFor="skip" className="cursor-pointer text-sm font-medium">
                          Omitir producto
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Le avisa al cliente y continúa con el siguiente.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-border p-4">
                      <RadioGroupItem value="suggest_alternative" id="suggest" />
                      <div className="flex-1">
                        <Label htmlFor="suggest" className="cursor-pointer text-sm font-medium">
                          Sugerir alternativa
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Ofrece un producto similar que sí esté disponible.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-border p-4">
                      <RadioGroupItem value="ask_customer" id="ask" />
                      <div className="flex-1">
                        <Label htmlFor="ask" className="cursor-pointer text-sm font-medium">
                          Preguntar al cliente
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Le pregunta qué prefiere en lugar de ese producto.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                    <Volume2 className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Voz y tono</CardTitle>
                    <CardDescription className="text-xs">Cómo debe sonar el bot</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tono de conversación</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(value) =>
                      setConfig({ ...config, tone: value as BotConfig["tone"] })
                    }
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="formal" className="rounded-lg">Formal</SelectItem>
                      <SelectItem value="friendly" className="rounded-lg">Amigable</SelectItem>
                      <SelectItem value="casual" className="rounded-lg">Casual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa</p>
                  <p className="text-sm text-foreground">
                    {config.tone === "formal" &&
                      "Buenas tardes. Gracias por llamar. ¿En qué puedo ayudarle con su pedido?"}
                    {config.tone === "friendly" &&
                      "Hola, gracias por llamar. ¿Qué te ayudo a pedir hoy?"}
                    {config.tone === "casual" &&
                      "¡Qué onda! ¿Qué vas a pedir hoy?"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
