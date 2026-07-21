"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  createDeliveryZone,
  createFaq,
  createPolicy,
  createPromotion,
  deleteDeliveryZone,
  deleteFaq,
  deletePolicy,
  deletePromotion,
  getBusinessSettings,
  getCurrentBusiness,
  listBusinessHours,
  listDeliveryZones,
  listFaqs,
  listPolicies,
  listPromotions,
  replaceBusinessHours,
  updateBusinessSettings,
  updateCurrentBusiness,
  updateFaq,
} from "@/lib/api"
import type { FAQ } from "@/lib/types"
import {
  Building2,
  Clock,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Tag,
  Trash2,
  Truck,
} from "lucide-react"

const dayLabels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

type BusinessForm = {
  name: string
  address: string
  phone: string
  twilioPhoneNumber: string
  humanTransferNumber: string
  email: string
  estimatedDeliveryTime: string
}

type HourForm = {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const defaultHours: HourForm[] = dayLabels.map((_, index) => ({
  day_of_week: index,
  open_time: "09:00",
  close_time: "18:00",
  is_closed: false,
}))

export default function BusinessPage() {
  const [businessInfo, setBusinessInfo] = useState<BusinessForm>({
    name: "",
    address: "",
    phone: "",
    twilioPhoneNumber: "",
    humanTransferNumber: "",
    email: "",
    estimatedDeliveryTime: "",
  })
  const [hours, setHours] = useState<HourForm[]>(defaultHours)
  const [deliverySettings, setDeliverySettings] = useState({
    deliveryEnabled: true,
    minimumOrderDelivery: 0,
    deliveryFee: 0,
  })
  const [deliveryZones, setDeliveryZones] = useState<Array<{ id: number; name: string }>>([])
  const [promotions, setPromotions] = useState<Array<{ id: number; text: string }>>([])
  const [policies, setPolicies] = useState<Array<{ id: number; text: string }>>([])
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [faqDialogOpen, setFaqDialogOpen] = useState(false)
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null)
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", category: "General" })
  const [newDeliveryZone, setNewDeliveryZone] = useState("")
  const [newPromotion, setNewPromotion] = useState("")
  const [newPolicy, setNewPolicy] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const faqCategories = useMemo(
    () => [...new Set(faqs.map((faq) => faq.category || "General"))],
    [faqs]
  )

  useEffect(() => {
    async function loadBusinessData() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const [
          business,
          settings,
          backendHours,
          zones,
          backendPromotions,
          backendPolicies,
          backendFaqs,
        ] = await Promise.all([
          getCurrentBusiness(),
          getBusinessSettings(),
          listBusinessHours(),
          listDeliveryZones(),
          listPromotions(),
          listPolicies(),
          listFaqs(),
        ])

        setBusinessInfo({
          name: business.name ?? "",
          address: business.address ?? "",
          phone: business.phone ?? "",
          twilioPhoneNumber: business.twilio_phone_number ?? "",
          humanTransferNumber: business.human_transfer_number ?? "",
          email: business.email ?? "",
          estimatedDeliveryTime: business.estimated_delivery_time ?? "",
        })

        setDeliverySettings({
          deliveryEnabled: settings.delivery_enabled,
          minimumOrderDelivery: Number(settings.minimum_order_delivery ?? 0),
          deliveryFee: Number(settings.delivery_fee ?? 0),
        })

        setHours(
          dayLabels.map((_, index) => {
            const hour = backendHours.find((item) => item.day_of_week === index)
            return {
              day_of_week: index,
              open_time: hour?.open_time?.slice(0, 5) ?? "09:00",
              close_time: hour?.close_time?.slice(0, 5) ?? "18:00",
              is_closed: hour?.is_closed ?? false,
            }
          })
        )

        setDeliveryZones(zones)
        setPromotions(backendPromotions)
        setPolicies(backendPolicies)
        setFaqs(
          backendFaqs.map((faq) => ({
            id: String(faq.id),
            question: faq.question,
            answer: faq.answer,
            category: faq.category ?? "General",
          }))
        )
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "No se pudo cargar la información del negocio."
        )
      } finally {
        setIsLoading(false)
      }
    }

    void loadBusinessData()
  }, [])

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    window.setTimeout(() => setSuccessMessage(""), 2500)
  }

  const handleSaveGeneralInfo = async () => {
    try {
      await updateCurrentBusiness({
        name: businessInfo.name,
        address: businessInfo.address,
        phone: businessInfo.phone,
        twilio_phone_number: businessInfo.twilioPhoneNumber,
        human_transfer_number: businessInfo.humanTransferNumber,
        email: businessInfo.email,
        estimated_delivery_time: businessInfo.estimatedDeliveryTime,
      })
      showSuccess("Información general actualizada.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la información general.")
    }
  }

  const handleSaveHours = async () => {
    try {
      await replaceBusinessHours(
        hours.map((hour) => ({
          day_of_week: hour.day_of_week,
          open_time: hour.is_closed ? null : `${hour.open_time}:00`,
          close_time: hour.is_closed ? null : `${hour.close_time}:00`,
          is_closed: hour.is_closed,
        }))
      )
      showSuccess("Horarios actualizados.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron guardar los horarios.")
    }
  }

  const handleSaveDeliverySettings = async () => {
    try {
      await Promise.all([
        updateCurrentBusiness({
          estimated_delivery_time: businessInfo.estimatedDeliveryTime,
        }),
        updateBusinessSettings({
          delivery_enabled: deliverySettings.deliveryEnabled,
          minimum_order_delivery: deliverySettings.minimumOrderDelivery,
          delivery_fee: deliverySettings.deliveryFee,
        }),
      ])
      showSuccess("Opciones de entrega actualizadas.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron guardar las opciones de entrega.")
    }
  }

  const handleAddDeliveryZone = async () => {
    const value = newDeliveryZone.trim()
    if (!value) return

    try {
      const zone = await createDeliveryZone(value)
      setDeliveryZones((current) => [...current, zone])
      setNewDeliveryZone("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo agregar la zona de entrega.")
    }
  }

  const handleAddPromotion = async () => {
    const value = newPromotion.trim()
    if (!value) return

    try {
      const promotion = await createPromotion(value)
      setPromotions((current) => [...current, promotion])
      setNewPromotion("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo agregar la promoción.")
    }
  }

  const handleAddPolicy = async () => {
    const value = newPolicy.trim()
    if (!value) return

    try {
      const policy = await createPolicy(value)
      setPolicies((current) => [...current, policy])
      setNewPolicy("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo agregar la política.")
    }
  }

  const handleSaveFaq = async () => {
    try {
      if (editingFaq) {
        await updateFaq(editingFaq.id, {
          question: editingFaq.question,
          answer: editingFaq.answer,
          category: editingFaq.category,
        })
        setFaqs((current) => current.map((faq) => (faq.id === editingFaq.id ? editingFaq : faq)))
      } else {
        const createdFaq = await createFaq(newFaq)
        setFaqs((current) => [
          ...current,
          {
            id: String(createdFaq.id),
            question: createdFaq.question,
            answer: createdFaq.answer,
            category: createdFaq.category ?? "General",
          },
        ])
      }

      setFaqDialogOpen(false)
      setEditingFaq(null)
      setNewFaq({ question: "", answer: "", category: "General" })
      showSuccess("Preguntas frecuentes actualizadas.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la FAQ.")
    }
  }

  const removeFaq = async (faqId: string) => {
    try {
      await deleteFaq(faqId)
      setFaqs((current) => current.filter((faq) => faq.id !== faqId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar la FAQ.")
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Información del negocio</h1>
          <p className="text-sm text-muted-foreground">
            Todo lo que el asistente necesita para responder, cobrar y entregar correctamente.
          </p>
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
              Cargando configuración del negocio...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Información general</CardTitle>
                      <CardDescription className="text-xs">Datos principales del negocio</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Nombre del negocio</Label>
                    <Input
                      id="businessName"
                      value={businessInfo.name}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, name: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Textarea
                        id="address"
                        value={businessInfo.address}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                        className="min-h-[70px] rounded-xl pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="phone"
                          value={businessInfo.phone}
                          onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                          className="rounded-xl pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Correo</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={businessInfo.email}
                          onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                          className="rounded-xl pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioPhoneNumber">Número de Twilio</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="twilioPhoneNumber"
                        value={businessInfo.twilioPhoneNumber}
                        onChange={(e) =>
                          setBusinessInfo({ ...businessInfo, twilioPhoneNumber: e.target.value })
                        }
                        placeholder="+526641234567"
                        className="rounded-xl pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se usa para enrutar cada llamada al negocio correcto. Escríbelo en formato E.164.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="humanTransferNumber">Número para atención humana</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="humanTransferNumber"
                        value={businessInfo.humanTransferNumber}
                        onChange={(e) =>
                          setBusinessInfo({ ...businessInfo, humanTransferNumber: e.target.value })
                        }
                        placeholder="+526649998877"
                        className="rounded-xl pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gemini transfiere aquí cuando el cliente pide hablar con una persona. No puede ser el número de Twilio.
                    </p>
                  </div>

                  <Button className="w-full rounded-xl" onClick={() => void handleSaveGeneralInfo()}>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar información general
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                      <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Horarios</CardTitle>
                      <CardDescription className="text-xs">Horario operativo del negocio</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hours.map((hour, index) => (
                    <div
                      key={hour.day_of_week}
                      className="flex flex-col gap-3 rounded-xl border border-border p-3 lg:flex-row lg:items-center"
                    >
                      <span className="w-24 text-sm font-medium">{dayLabels[hour.day_of_week]}</span>
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="time"
                          value={hour.open_time}
                          disabled={hour.is_closed}
                          onChange={(e) => {
                            const nextHours = [...hours]
                            nextHours[index].open_time = e.target.value
                            setHours(nextHours)
                          }}
                          className="h-8 rounded-lg text-xs"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={hour.close_time}
                          disabled={hour.is_closed}
                          onChange={(e) => {
                            const nextHours = [...hours]
                            nextHours[index].close_time = e.target.value
                            setHours(nextHours)
                          }}
                          className="h-8 rounded-lg text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Cerrado</span>
                        <Switch
                          checked={hour.is_closed}
                          onCheckedChange={(checked) => {
                            const nextHours = [...hours]
                            nextHours[index].is_closed = checked
                            setHours(nextHours)
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <Button className="w-full rounded-xl" onClick={() => void handleSaveHours()}>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar horarios
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                      <Truck className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Entrega</CardTitle>
                      <CardDescription className="text-xs">Cobertura y condiciones de entrega</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Entrega habilitada</p>
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
                      <Label htmlFor="deliveryFee">Costo de envío</Label>
                      <Input
                        id="deliveryFee"
                        type="number"
                        value={deliverySettings.deliveryFee}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            deliveryFee: Number(e.target.value) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minimumOrderDelivery">Pedido mínimo para entrega</Label>
                      <Input
                        id="minimumOrderDelivery"
                        type="number"
                        value={deliverySettings.minimumOrderDelivery}
                        onChange={(e) =>
                          setDeliverySettings({
                            ...deliverySettings,
                            minimumOrderDelivery: Number(e.target.value) || 0,
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estimatedDeliveryTime">Tiempo estimado de entrega</Label>
                    <Input
                      id="estimatedDeliveryTime"
                      value={businessInfo.estimatedDeliveryTime}
                      onChange={(e) =>
                        setBusinessInfo({ ...businessInfo, estimatedDeliveryTime: e.target.value })
                      }
                      placeholder="Ej. 30-45 minutos"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {deliveryZones.map((zone) => (
                      <Badge key={zone.id} variant="secondary" className="rounded-lg px-3 py-1.5 text-sm">
                        {zone.name}
                        <button
                          className="ml-2 hover:text-destructive"
                          onClick={() =>
                            void deleteDeliveryZone(zone.id)
                              .then(() => {
                                setDeliveryZones((current) => current.filter((item) => item.id !== zone.id))
                              })
                              .catch((error: unknown) => {
                                setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar la zona.")
                              })
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={newDeliveryZone}
                      onChange={(e) => setNewDeliveryZone(e.target.value)}
                      placeholder="Agregar zona de entrega..."
                      className="rounded-xl"
                    />
                    <Button variant="outline" className="rounded-xl" onClick={() => void handleAddDeliveryZone()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button className="w-full rounded-xl" onClick={() => void handleSaveDeliverySettings()}>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar opciones de entrega
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                      <Tag className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Promociones</CardTitle>
                      <CardDescription className="text-xs">Ofertas que el asistente puede mencionar</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {promotions.map((promotion) => (
                    <div key={promotion.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <p className="flex-1 text-sm text-foreground">{promotion.text}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          void deletePromotion(promotion.id)
                            .then(() => {
                              setPromotions((current) => current.filter((item) => item.id !== promotion.id))
                            })
                            .catch((error: unknown) => {
                              setErrorMessage(
                                error instanceof Error ? error.message : "No se pudo eliminar la promoción."
                              )
                            })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={newPromotion}
                      onChange={(e) => setNewPromotion(e.target.value)}
                      placeholder="Agregar promoción..."
                      className="rounded-xl"
                    />
                    <Button variant="outline" className="rounded-xl" onClick={() => void handleAddPromotion()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50">
                    <MessageCircle className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
                    <p className="text-sm text-muted-foreground">
                      Respuestas listas para el asistente.
                    </p>
                  </div>
                </div>
                <Button
                  className="rounded-xl"
                  onClick={() => {
                    setEditingFaq(null)
                    setNewFaq({ question: "", answer: "", category: "General" })
                    setFaqDialogOpen(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar FAQ
                </Button>
              </div>

              <Card className="border-border shadow-sm">
                <CardContent className="p-0">
                  <Accordion type="single" collapsible className="w-full">
                    {faqCategories.map((category) => (
                      <AccordionItem key={category} value={category} className="border-border px-4">
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{category}</span>
                            <Badge variant="secondary" className="text-xs">
                              {faqs.filter((faq) => faq.category === category).length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-3">
                            {faqs
                              .filter((faq) => faq.category === category)
                              .map((faq) => (
                                <div
                                  key={faq.id}
                                  className="rounded-xl border border-border p-4 transition-colors hover:bg-secondary/30"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-foreground">{faq.question}</p>
                                      <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingFaq(faq)
                                          setFaqDialogOpen(true)
                                        }}
                                      >
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => void removeFaq(faq.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Políticas</CardTitle>
                    <CardDescription className="text-xs">
                      Condiciones que el asistente puede comunicar al cliente
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {policies.map((policy) => (
                  <div key={policy.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <p className="flex-1 text-sm text-foreground">{policy.text}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() =>
                        void deletePolicy(policy.id)
                          .then(() => {
                            setPolicies((current) => current.filter((item) => item.id !== policy.id))
                          })
                          .catch((error: unknown) => {
                            setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar la política.")
                          })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input
                    value={newPolicy}
                    onChange={(e) => setNewPolicy(e.target.value)}
                    placeholder="Agregar política..."
                    className="rounded-xl"
                  />
                  <Button variant="outline" className="rounded-xl" onClick={() => void handleAddPolicy()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFaq ? "Editar FAQ" : "Agregar FAQ"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para crear o editar una pregunta frecuente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="faqQuestion">Pregunta</Label>
              <Input
                id="faqQuestion"
                value={editingFaq?.question ?? newFaq.question}
                onChange={(e) =>
                  editingFaq
                    ? setEditingFaq({ ...editingFaq, question: e.target.value })
                    : setNewFaq({ ...newFaq, question: e.target.value })
                }
                placeholder="¿Qué preguntará el cliente?"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faqAnswer">Respuesta</Label>
              <Textarea
                id="faqAnswer"
                value={editingFaq?.answer ?? newFaq.answer}
                onChange={(e) =>
                  editingFaq
                    ? setEditingFaq({ ...editingFaq, answer: e.target.value })
                    : setNewFaq({ ...newFaq, answer: e.target.value })
                }
                placeholder="¿Cómo debe responder el asistente?"
                className="min-h-[100px] rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faqCategory">Categoría</Label>
              <Input
                id="faqCategory"
                value={editingFaq?.category ?? newFaq.category}
                onChange={(e) =>
                  editingFaq
                    ? setEditingFaq({ ...editingFaq, category: e.target.value })
                    : setNewFaq({ ...newFaq, category: e.target.value })
                }
                placeholder="Ej. Entrega, pagos, comida"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaqDialogOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveFaq()} className="rounded-xl">
              {editingFaq ? "Guardar cambios" : "Agregar FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
