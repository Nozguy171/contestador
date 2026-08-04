"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  getBotConfig,
  getBusinessSettings,
  getCurrentBusiness,
  getVoicePreview,
  getVoiceRuntime,
  updateBotConfig,
  updateBusinessSettings,
  updateCurrentBusiness,
} from "@/lib/api"
import type { VoiceRuntimeStatus } from "@/lib/api"
import type { BotConfig } from "@/lib/types"
import { Bot, CheckCircle2, MessageSquare, Play, Save, Settings2, ShieldCheck } from "lucide-react"

const voiceOptions = [
  ["Zephyr", "Brillante"], ["Puck", "Animada"], ["Charon", "Informativa"], ["Kore", "Firme"],
  ["Fenrir", "Entusiasta"], ["Leda", "Joven"], ["Orus", "Firme"], ["Aoede", "Aireada"],
  ["Callirrhoe", "Relajada"], ["Autonoe", "Brillante"], ["Enceladus", "Aireada"], ["Iapetus", "Clara"],
  ["Umbriel", "Relajada"], ["Algieba", "Suave"], ["Despina", "Suave"], ["Erinome", "Clara"],
  ["Algenib", "Grave"], ["Rasalgethi", "Informativa"], ["Laomedeia", "Animada"], ["Achernar", "Suave"],
  ["Alnilam", "Firme"], ["Schedar", "Grave"], ["Gacrux", "Madura"], ["Pulcherrima", "Adulta"],
  ["Achird", "Amigable"], ["Zubenelgenubi", "Casual"], ["Vindemiatrix", "Amigable"], ["Sadachbia", "Animada"],
  ["Sadaltager", "Conocedora"], ["Sulafat", "Cálida"],
] as const

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
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [voiceName, setVoiceName] = useState("Iapetus")
  const [twilioNumber, setTwilioNumber] = useState("")
  const [transferNumber, setTransferNumber] = useState("")
  const [runtime, setRuntime] = useState<VoiceRuntimeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    async function load() {
      try {
        setErrorMessage("")
        const [botConfig, voiceRuntime, settings, business] = await Promise.all([
          getBotConfig(),
          getVoiceRuntime(),
          getBusinessSettings(),
          getCurrentBusiness(),
        ])
        setConfig(botConfig)
        setRuntime(voiceRuntime)
        setVoiceEnabled(settings.voice_enabled)
        setVoiceName(settings.voice_name || voiceRuntime.gemini.voice_name || "Iapetus")
        setTwilioNumber(business.twilio_phone_number ?? "")
        setTransferNumber(business.human_transfer_number ?? "")
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el asistente.")
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  async function save() {
    try {
      setIsSaving(true)
      setErrorMessage("")
      const [updated] = await Promise.all([
        updateBotConfig({ ...config, confirmationRequired: true }),
        updateBusinessSettings({ voice_enabled: voiceEnabled, voice_name: voiceName }),
        updateCurrentBusiness({
          twilio_phone_number: twilioNumber.trim() || null,
          human_transfer_number: transferNumber.trim() || null,
        }),
      ])
      setConfig(updated)
      setSuccessMessage("Asistente actualizado.")
      window.setTimeout(() => setSuccessMessage(""), 2500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar el asistente.")
    } finally {
      setIsSaving(false)
    }
  }

  async function previewVoice() {
    try {
      setIsPreviewing(true)
      setErrorMessage("")
      const blob = await getVoicePreview(voiceName)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.onerror = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo reproducir el preview.")
    } finally {
      setIsPreviewing(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Asistente de llamadas</h1>
            <p className="text-sm text-muted-foreground">Actívalo sólo si el negocio contratará atención telefónica.</p>
          </div>
          <Button className="rounded-xl" disabled={isLoading || isSaving} onClick={() => void save()}>
            <Save className="mr-2 h-4 w-4" />{isSaving ? "Guardando..." : "Guardar"}
          </Button>
        </div>

        {errorMessage ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}
        {successMessage ? <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex items-center gap-2 py-4 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{successMessage}</CardContent></Card> : null}

        <Card className={voiceEnabled ? "border-emerald-200" : "border-border"}>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-50 p-2.5"><Bot className="h-5 w-5 text-violet-600" /></div>
              <div><p className="font-semibold">Módulo de llamadas con IA</p><p className="text-sm text-muted-foreground">Al apagarlo, Twilio rechazará llamadas; POS, cocina e inventario seguirán funcionando.</p></div>
            </div>
            <div className="flex shrink-0 items-center gap-3"><Badge variant={voiceEnabled ? "default" : "secondary"}>{voiceEnabled ? "Activo" : "Desactivado"}</Badge><Switch aria-label="Activar asistente de llamadas" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} /></div>
          </CardContent>
        </Card>

        {runtime ? (
          <Card className={runtime.ready ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold">{!voiceEnabled ? "Módulo desactivado" : runtime.ready ? "Telefonía lista" : "Configuración incompleta"}</p><p className="break-all text-xs text-muted-foreground">{runtime.twilio.inbound_url ?? "Falta configurar el dominio público."}</p></div>
              <p className="text-xs text-muted-foreground">Twilio Media Streams ↔ {runtime.gemini.model}</p>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && voiceEnabled ? (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Telefonía</CardTitle><CardDescription>Números en formato internacional E.164. Esta sección sólo importa si el módulo está activo.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="bot-twilio-number">Número de Twilio</Label><Input id="bot-twilio-number" value={twilioNumber} onChange={(event) => setTwilioNumber(event.target.value)} placeholder="+17179372169" /></div>
                <div className="space-y-2"><Label htmlFor="bot-transfer-number">Transferir a una persona</Label><Input id="bot-transfer-number" value={transferNumber} onChange={(event) => setTransferNumber(event.target.value)} placeholder="+526649998877" /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-5 w-5 text-blue-600" />Saludo</CardTitle><CardDescription>Si lo dejas vacío, se usa un saludo automático con el nombre del negocio.</CardDescription></CardHeader>
              <CardContent><Textarea value={config.welcomeMessage} onChange={(event) => setConfig({ ...config, welcomeMessage: event.target.value })} placeholder="Gracias por llamar..." className="min-h-32 rounded-xl" /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Play className="h-5 w-5 text-violet-600" />Voz del asistente</CardTitle><CardDescription>Elige una voz de Gemini y escúchala antes de guardarla. Esta voz se usará en las llamadas nuevas.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Select value={voiceName} onValueChange={setVoiceName}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{voiceOptions.map(([value, description]) => <SelectItem key={value} value={value}>{value} — {description}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="shrink-0 rounded-xl" disabled={isPreviewing} onClick={() => void previewVoice()}>
                    <Play className="mr-2 h-4 w-4" />{isPreviewing ? "Reproduciendo..." : "Probar voz"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">El preview se genera con el mismo motor de voz; la llamada telefónica seguirá teniendo el ancho de banda normal de una línea telefónica.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-5 w-5 text-violet-600" />Estilo de conversación</CardTitle><CardDescription>Un solo ajuste fácil de explicar al cliente.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Tono</Label><Select value={config.tone} onValueChange={(value) => setConfig({ ...config, tone: value as BotConfig["tone"] })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="formal">Formal</SelectItem><SelectItem value="friendly">Amigable</SelectItem><SelectItem value="casual">Casual</SelectItem></SelectContent></Select></div>
                <p className="rounded-xl bg-secondary/50 p-4 text-sm">{config.tone === "formal" ? "Buenas tardes. ¿En qué puedo ayudarle con su pedido?" : config.tone === "casual" ? "¡Qué onda! ¿Qué vas a pedir hoy?" : "Hola, gracias por llamar. ¿Qué te ayudo a pedir hoy?"}</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-0">
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-0 px-5"><AccordionTrigger className="py-5"><span className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-muted-foreground" />Instrucciones avanzadas (opcional)</span></AccordionTrigger><AccordionContent className="pb-5"><Textarea value={config.specialInstructions} onChange={(event) => setConfig({ ...config, specialInstructions: event.target.value })} placeholder="Ej. No ofrecer salsa extra los domingos." className="min-h-32 rounded-xl" /><p className="mt-2 text-xs text-muted-foreground">Úsalas sólo para excepciones; menú, precios y disponibilidad se configuran en sus propias secciones.</p></AccordionContent></AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50 lg:col-span-2"><CardContent className="flex items-start gap-3 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold">Reglas seguras automáticas</p><p className="text-xs text-muted-foreground">La confirmación del pedido, validación de precios, productos agotados, métodos de pago e idempotencia ya no se presentan como opciones: el backend siempre las aplica.</p></div></CardContent></Card>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
