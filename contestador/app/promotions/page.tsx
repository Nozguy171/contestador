"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createPromotion, deletePromotion, getBusinessSettings, listProducts, listPromotions, updateBusinessSettings, updatePromotion } from "@/lib/api"
import type { Category, Product, Promotion, PromotionScope, PromotionType } from "@/lib/types"
import { CalendarDays, Edit3, Plus, Sparkles, Tag, Trash2 } from "lucide-react"

const days = ["L", "M", "M", "J", "V", "S", "D"]
const fullDays = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
const timezones = [
  ["America/Mexico_City", "Ciudad de México"],
  ["America/Tijuana", "Tijuana"],
  ["America/Cancun", "Cancún"],
  ["America/New_York", "Este de EE. UU."],
  ["America/Chicago", "Centro de EE. UU."],
  ["America/Denver", "Montaña de EE. UU."],
  ["America/Los_Angeles", "Pacífico de EE. UU."],
  ["America/Phoenix", "Arizona"],
  ["UTC", "UTC"],
] as const

type FormState = {
  name: string
  text: string
  promotion_type: PromotionType
  value: number
  scope_type: PromotionScope
  product_id: string
  category_id: string
  days_of_week: number[]
  starts_at: string
  ends_at: string
  is_active: boolean
}

const emptyForm: FormState = {
  name: "",
  text: "",
  promotion_type: "percentage",
  value: 10,
  scope_type: "all",
  product_id: "",
  category_id: "",
  days_of_week: [],
  starts_at: "",
  ends_at: "",
  is_active: true,
}

const statusLabels = {
  active: "Activa ahora",
  scheduled: "Programada",
  expired: "Terminada",
  inactive: "Pausada",
}

function typeLabel(item: Promotion) {
  if (item.promotion_type === "percentage") return `${Number(item.value)}% de descuento`
  if (item.promotion_type === "two_for_one") return "2x1"
  return "Segunda unidad al 50%"
}

function scopeLabel(item: Promotion, products: Product[], categories: Category[]) {
  if (item.scope_type === "all") return "Todo el menú"
  if (item.scope_type === "product") return products.find((product) => Number(product.id) === item.product_id)?.name ?? "Producto"
  return categories.find((category) => Number(category.id) === item.category_id)?.name ?? "Categoría"
}

function toInputDate(value?: string | null) {
  return value ? value.slice(0, 16) : ""
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [deleting, setDeleting] = useState<Promotion | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [timezone, setTimezone] = useState("America/Mexico_City")
  const [errorMessage, setErrorMessage] = useState("")

  async function load() {
    try {
      setErrorMessage("")
      const [items, menu, settings] = await Promise.all([listPromotions(), listProducts(), getBusinessSettings()])
      setPromotions(items)
      setProducts(menu.products)
      setCategories(menu.categories)
      setTimezone(settings.timezone || "America/Mexico_City")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar las promociones.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const activeCount = useMemo(() => promotions.filter((item) => item.status === "active").length, [promotions])

  function openCreate(suggestedDay?: number) {
    setEditing(null)
    setForm({ ...emptyForm, days_of_week: suggestedDay === undefined ? [] : [suggestedDay] })
    setErrorMessage("")
    setDialogOpen(true)
  }

  function openEdit(item: Promotion) {
    setEditing(item)
    setForm({
      name: item.name,
      text: item.text,
      promotion_type: item.promotion_type,
      value: Number(item.value),
      scope_type: item.scope_type,
      product_id: item.product_id ? String(item.product_id) : "",
      category_id: item.category_id ? String(item.category_id) : "",
      days_of_week: item.days_of_week ?? [],
      starts_at: toInputDate(item.starts_at),
      ends_at: toInputDate(item.ends_at),
      is_active: item.is_active,
    })
    setErrorMessage("")
    setDialogOpen(true)
  }

  async function save() {
    try {
      setIsSaving(true)
      setErrorMessage("")
      const payload = {
        name: form.name,
        text: form.text,
        promotion_type: form.promotion_type,
        value: form.promotion_type === "percentage" ? form.value : 0,
        scope_type: form.scope_type,
        product_id: form.scope_type === "product" ? Number(form.product_id) : null,
        category_id: form.scope_type === "category" ? Number(form.category_id) : null,
        days_of_week: form.days_of_week,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: form.is_active,
      }
      const saved = editing
        ? await updatePromotion(editing.id, payload)
        : await createPromotion(payload)
      setPromotions((current) => editing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current])
      setDialogOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo guardar la promoción.")
    } finally {
      setIsSaving(false)
    }
  }

  async function toggle(item: Promotion, checked: boolean) {
    try {
      const saved = await updatePromotion(item.id, { is_active: checked })
      setPromotions((current) => current.map((currentItem) => currentItem.id === saved.id ? saved : currentItem))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado.")
    }
  }

  async function changeTimezone(value: string) {
    try {
      setErrorMessage("")
      await updateBusinessSettings({ timezone: value })
      setTimezone(value)
      setPromotions(await listPromotions())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cambiar la zona horaria.")
    }
  }

  async function remove() {
    if (!deleting) return
    try {
      await deletePromotion(deleting.id)
      setPromotions((current) => current.filter((item) => item.id !== deleting.id))
      setDeleting(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar la promoción.")
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700"><Sparkles className="h-4 w-4" />Ventas y fidelización</div>
            <h1 className="text-2xl font-semibold tracking-tight">Promociones</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">El descuento se calcula en servidor y el asistente de llamadas sólo anuncia las promociones vigentes.</p>
          </div>
          <Button className="w-full rounded-xl sm:w-auto" onClick={() => openCreate()}><Plus className="mr-2 h-4 w-4" />Nueva promoción</Button>
        </div>

        {errorMessage && !dialogOpen ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Activas hoy</p><p className="mt-1 text-3xl font-semibold">{activeCount}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Configuradas</p><p className="mt-1 text-3xl font-semibold">{promotions.length}</p></CardContent></Card>
          <Card className="border-emerald-200 bg-emerald-50/50"><CardContent className="pt-6"><p className="text-sm font-medium text-emerald-800">Regla de seguridad</p><p className="mt-1 text-sm text-emerald-700">Si coinciden varias, se aplica sólo la de mayor ahorro.</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-medium">Zona horaria de las promociones</p><p className="text-xs text-muted-foreground">Define cuándo cambian el día, el inicio y el fin de cada oferta.</p></div>
            <Select value={timezone} onValueChange={(value) => void changeTimezone(value)}><SelectTrigger className="w-full rounded-xl sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{timezones.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </CardContent>
        </Card>

        {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando promociones...</CardContent></Card> : promotions.length === 0 ? (
          <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><Tag className="mb-4 h-10 w-10 text-muted-foreground/50" /><h2 className="font-semibold">Todavía no hay promociones</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Crea una oferta; podrás limitarla por días, fechas, categoría o producto.</p><Button className="mt-5 rounded-xl" onClick={() => openCreate()}>Crear la primera</Button></CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {promotions.map((item) => (
              <Card key={item.id} className={item.status === "active" ? "border-emerald-200" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">{item.name}</CardTitle><Badge variant={item.status === "active" ? "default" : "secondary"}>{statusLabels[item.status]}</Badge></div><CardDescription className="mt-2">{item.customer_description}</CardDescription></div>
                    <Switch aria-label={`Activar ${item.name}`} checked={item.is_active} onCheckedChange={(checked) => void toggle(item, checked)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2"><Badge variant="outline">{typeLabel(item)}</Badge><Badge variant="outline">{scopeLabel(item, products, categories)}</Badge>{item.days_of_week.length ? <Badge variant="outline"><CalendarDays className="mr-1 h-3 w-3" />{item.days_of_week.map((day) => fullDays[day].slice(0, 3)).join(", ")}</Badge> : <Badge variant="outline">Todos los días</Badge>}</div>
                  <div className="flex gap-2 border-t pt-4"><Button variant="outline" className="flex-1 rounded-xl" onClick={() => openEdit(item)}><Edit3 className="mr-2 h-4 w-4" />Editar</Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4" /></Button></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar promoción" : "Nueva promoción"}</DialogTitle><DialogDescription>Define la regla que usará el POS y la forma en que la anunciará el bot.</DialogDescription></DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {errorMessage ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div> : null}
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="promo-name">Nombre interno</Label><Input id="promo-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Martes de hamburguesas" /></div><div className="space-y-2"><Label>Tipo</Label><Select value={form.promotion_type} onValueChange={(value) => setForm({ ...form, promotion_type: value as PromotionType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Porcentaje de descuento</SelectItem><SelectItem value="two_for_one">2x1</SelectItem><SelectItem value="second_half">Segunda unidad al 50%</SelectItem></SelectContent></Select></div></div>
            {form.promotion_type === "percentage" ? <div className="space-y-2"><Label htmlFor="promo-value">Porcentaje</Label><Input id="promo-value" type="number" min="0.01" max="100" step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: Number(event.target.value) })} /></div> : null}
            <div className="space-y-2"><Label htmlFor="promo-text">Mensaje para el cliente y el bot</Label><Textarea id="promo-text" className="min-h-24" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="Los martes llévate dos hamburguesas y paga una." /><p className="text-xs text-muted-foreground">El mensaje informa; el backend siempre decide y calcula el descuento real.</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Aplica a</Label><Select value={form.scope_type} onValueChange={(value) => setForm({ ...form, scope_type: value as PromotionScope, product_id: "", category_id: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo el menú</SelectItem><SelectItem value="category">Una categoría</SelectItem><SelectItem value="product">Un producto</SelectItem></SelectContent></Select></div>{form.scope_type === "category" ? <div className="space-y-2"><Label>Categoría</Label><Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div> : null}{form.scope_type === "product" ? <div className="space-y-2"><Label>Producto</Label><Select value={form.product_id} onValueChange={(value) => setForm({ ...form, product_id: value })}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{products.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div> : null}</div>
            <div className="space-y-2"><Label>Días de la semana</Label><div className="grid grid-cols-7 gap-1.5">{days.map((label, index) => { const selected = form.days_of_week.includes(index); return <Button key={index} type="button" variant={selected ? "default" : "outline"} size="sm" className="px-0" title={fullDays[index]} onClick={() => setForm({ ...form, days_of_week: selected ? form.days_of_week.filter((day) => day !== index) : [...form.days_of_week, index].sort() })}>{label}</Button> })}</div><p className="text-xs text-muted-foreground">Sin selección significa todos los días.</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="promo-start">Inicio opcional</Label><Input id="promo-start" type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="promo-end">Fin opcional</Label><Input id="promo-end" type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></div></div>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-4"><span><span className="block text-sm font-medium">Promoción habilitada</span><span className="text-xs text-muted-foreground">Puedes guardarla pausada para terminarla después.</span></span><Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} /></label>
          </div>
          <DialogFooter className="border-t pt-4"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button disabled={isSaving} onClick={() => void save()}>{isSaving ? "Guardando..." : "Guardar promoción"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>Los pedidos anteriores conservarán el nombre y descuento aplicados, pero esta regla ya no estará disponible.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void remove()}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </DashboardLayout>
  )
}
