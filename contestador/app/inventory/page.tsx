"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  adjustInventoryItem,
  createInventoryCategory,
  createInventoryItem,
  listInventory,
  listInventoryCategories,
  listInventoryMovements,
  updateInventoryItem,
  uploadImage,
} from "@/lib/api"
import type { InventoryCategory, InventoryItem, InventoryMovement } from "@/lib/types"
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Boxes,
  CircleDollarSign,
  Clock3,
  History,
  ImagePlus,
  Layers3,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react"

const emptyForm = {
  name: "",
  unit: "unidad",
  quantity: 0,
  minimumQuantity: 0,
  costPerUnit: 0,
  categoryId: "",
  imageUrl: "",
  lowStockAlertEnabled: true,
}

const movementLabels: Record<InventoryMovement["movementType"], string> = {
  initial: "Existencia inicial",
  purchase: "Entrada",
  sale: "Consumo por venta",
  waste: "Merma",
  correction: "Corrección",
  reversal: "Devolución",
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [activeTab, setActiveTab] = useState("stock")
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null)
  const [adjustment, setAdjustment] = useState({ amount: 0, movementType: "purchase" as "purchase" | "waste" | "correction", reason: "" })
  const [groupOpen, setGroupOpen] = useState(false)
  const [newGroup, setNewGroup] = useState({ name: "", color: "#0f766e" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  async function loadAll() {
    try {
      setErrorMessage("")
      const [inventory, groups, history] = await Promise.all([
        listInventory(),
        listInventoryCategories(),
        listInventoryMovements(),
      ])
      setItems(inventory)
      setCategories(groups)
      setMovements(history)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el inventario.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesSearch = !term || item.name.toLowerCase().includes(term) || item.category?.name.toLowerCase().includes(term)
      const matchesGroup = categoryFilter === "all"
        || (categoryFilter === "none" ? !item.categoryId : item.categoryId === categoryFilter)
      return matchesSearch && matchesGroup
    })
  }, [items, search, categoryFilter])

  const activeItems = items.filter((item) => item.isActive)
  const lowStock = activeItems.filter((item) => item.isLowStock)
  const filteredMovements = movements.filter((movement) => !search || movement.itemName.toLowerCase().includes(search.toLowerCase()))
  const inventoryValue = activeItems.reduce((total, item) => total + item.quantity * item.costPerUnit, 0)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditing(item)
    setForm({
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      minimumQuantity: item.minimumQuantity,
      costPerUnit: item.costPerUnit,
      categoryId: item.categoryId ?? "",
      imageUrl: item.imageUrl ?? "",
      lowStockAlertEnabled: item.lowStockAlertEnabled,
    })
    setFormOpen(true)
  }

  async function saveItem(event: React.FormEvent) {
    event.preventDefault()
    try {
      setIsSaving(true)
      if (editing) {
        await updateInventoryItem(editing.id, {
          name: form.name,
          unit: form.unit,
          minimumQuantity: form.minimumQuantity,
          costPerUnit: form.costPerUnit,
          categoryId: form.categoryId,
          imageUrl: form.imageUrl,
          lowStockAlertEnabled: form.lowStockAlertEnabled,
        })
      } else {
        await createInventoryItem(form)
      }
      setFormOpen(false)
      toast.success(editing ? "Artículo actualizado." : "Artículo agregado al inventario.")
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el artículo.")
    } finally {
      setIsSaving(false)
    }
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault()
    try {
      setIsSaving(true)
      const category = await createInventoryCategory(newGroup)
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)))
      setForm((current) => ({ ...current, categoryId: category.id }))
      setNewGroup({ name: "", color: "#0f766e" })
      setGroupOpen(false)
      toast.success("Grupo creado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el grupo.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImage(file?: File) {
    if (!file) return
    try {
      setIsUploading(true)
      const url = await uploadImage(file)
      setForm((current) => ({ ...current, imageUrl: url }))
      toast.success("Imagen cargada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la imagen.")
    } finally {
      setIsUploading(false)
    }
  }

  function adjustmentDelta() {
    if (adjustment.movementType === "waste") return -Math.abs(adjustment.amount)
    if (adjustment.movementType === "purchase") return Math.abs(adjustment.amount)
    return adjustment.amount
  }

  async function applyAdjustment(event: React.FormEvent) {
    event.preventDefault()
    if (!adjusting || !adjustment.amount) return
    try {
      setIsSaving(true)
      await adjustInventoryItem(adjusting.id, {
        delta: adjustmentDelta(),
        movementType: adjustment.movementType,
        reason: adjustment.reason,
      })
      setAdjusting(null)
      setAdjustment({ amount: 0, movementType: "purchase", reason: "" })
      toast.success("Movimiento registrado.")
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el movimiento.")
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleActive(item: InventoryItem, isActive: boolean) {
    try {
      await updateInventoryItem(item.id, { isActive })
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, isActive } : row))
      toast.success(isActive ? "Artículo activado." : "Artículo archivado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el artículo.")
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900 p-5 text-white shadow-xl shadow-emerald-950/10 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge className="mb-3 border-white/20 bg-white/10 text-white">Control operativo</Badge>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Inventario y materias primas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/75">
                Organiza insumos, controla existencias y conecta recetas para descontar automáticamente al confirmar pedidos.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setGroupOpen(true)}>
                <Layers3 className="h-4 w-4" />Nuevo grupo
              </Button>
              <Button className="rounded-xl bg-white text-emerald-950 hover:bg-emerald-50" onClick={openCreate}>
                <Plus className="h-4 w-4" />Agregar artículo
              </Button>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <Alert variant="destructive" className="rounded-2xl border-red-200 bg-red-50">
            <AlertCircle />
            <AlertTitle>No pudimos cargar el inventario</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{errorMessage}</span>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void loadAll()}>Reintentar</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Artículos activos", value: activeItems.length.toString(), icon: Boxes, color: "text-blue-600", background: "bg-blue-50" },
            { label: "Stock bajo", value: lowStock.length.toString(), icon: TriangleAlert, color: "text-amber-700", background: "bg-amber-50" },
            { label: "Grupos", value: categories.length.toString(), icon: Layers3, color: "text-violet-600", background: "bg-violet-50" },
            { label: "Valor estimado", value: `$${inventoryValue.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`, icon: CircleDollarSign, color: "text-emerald-700", background: "bg-emerald-50" },
          ].map((stat) => (
            <Card key={stat.label} className="gap-0 py-0">
              <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${stat.background} ${stat.color}`}><stat.icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block truncate text-xs text-muted-foreground">{stat.label}</span><span className="block truncate text-xl font-semibold">{stat.value}</span></span>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl sm:w-80">
            <TabsTrigger value="stock" className="rounded-lg"><Boxes className="mr-2 h-4 w-4" />Existencias</TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg"><History className="mr-2 h-4 w-4" />Movimientos</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="mt-5 space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl border bg-card/80 p-3 shadow-sm sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar artículo o grupo..." className="rounded-xl border-0 bg-secondary/60 pl-9 shadow-none" />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="rounded-xl sm:w-56"><SlidersHorizontal className="h-4 w-4" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  <SelectItem value="none">Sin grupo</SelectItem>
                  {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Cargando inventario...</CardContent></Card>
            ) : filtered.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center py-14 text-center"><PackagePlus className="mb-3 h-10 w-10 text-muted-foreground/40" /><p className="font-medium">No hay artículos para mostrar</p><p className="mt-1 text-sm text-muted-foreground">Agrega el primero o cambia tus filtros.</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item) => (
                  <Card key={item.id} className={`group gap-0 overflow-hidden py-0 transition hover:-translate-y-0.5 hover:shadow-lg ${!item.isActive ? "opacity-60" : ""}`}>
                    <div className="flex h-28 items-end bg-gradient-to-br from-slate-100 to-slate-200 p-4" style={item.imageUrl ? { backgroundImage: `linear-gradient(to top,rgba(15,23,42,.72),rgba(15,23,42,.05)),url(${item.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                      <div className="flex w-full items-end justify-between gap-2">
                        <Badge className="border-0 text-white" style={{ backgroundColor: item.category?.color ?? "#64748b" }}>{item.category?.name ?? "Sin grupo"}</Badge>
                        {item.isLowStock ? <Badge className="bg-amber-500 text-white"><BellRing className="h-3 w-3" />Stock bajo</Badge> : null}
                      </div>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h2 className="truncate font-semibold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">Costo: ${item.costPerUnit.toLocaleString("es-MX")} por {item.unit}</p></div>
                        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /><span className="sr-only">Editar {item.name}</span></Button>
                      </div>
                      <div className={`rounded-2xl p-4 ${item.isLowStock ? "bg-amber-50" : "bg-secondary/50"}`}>
                        <p className="text-2xl font-semibold">{item.quantity.toLocaleString("es-MX")} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span></p>
                        <p className="mt-1 text-xs text-muted-foreground">Aviso en {item.minimumQuantity.toLocaleString("es-MX")} {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setAdjusting(item); setAdjustment({ amount: 0, movementType: "purchase", reason: "" }) }}><Plus className="h-4 w-4" />Movimiento</Button>
                        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setActiveTab("history"); setSearch(item.name) }}><History className="h-4 w-4" />Historial</Button>
                        <Switch className="ml-auto" checked={item.isActive} onCheckedChange={(checked) => void toggleActive(item, checked)} aria-label={`Activar ${item.name}`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-5 space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar historial por artículo..." className="rounded-xl bg-card pl-9" />
            </div>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="divide-y">
                {filteredMovements.map((movement) => (
                  <div key={movement.id} className="flex flex-col gap-3 p-4 transition hover:bg-secondary/30 sm:flex-row sm:items-center sm:p-5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${movement.quantityDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {movement.quantityDelta >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{movement.itemName}</p><Badge variant="secondary">{movementLabels[movement.movementType]}</Badge>{movement.orderFolio ? <Badge variant="outline">{movement.orderFolio}</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{movement.reason || "Sin nota"} · {movement.changedByLabel || "Sistema"}</p></div>
                    <div className="sm:text-right"><p className={`font-semibold ${movement.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta.toLocaleString("es-MX")} {movement.unit}</p><p className="mt-1 flex items-center text-xs text-muted-foreground sm:justify-end"><Clock3 className="mr-1 h-3 w-3" />{new Date(movement.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</p></div>
                  </div>
                ))}
                {!filteredMovements.length ? <div className="py-14 text-center text-sm text-muted-foreground">No hay movimientos para mostrar.</div> : null}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar artículo" : "Agregar al inventario"}</DialogTitle><DialogDescription>Puede ser una materia prima, empaque, bebida o cualquier artículo que quieras controlar.</DialogDescription></DialogHeader>
          <form className="space-y-5" onSubmit={saveItem}>
            <div className="grid gap-5 sm:grid-cols-[150px_1fr]">
              <div>
                <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl border border-dashed bg-secondary/40 text-muted-foreground" style={form.imageUrl ? { backgroundImage: `url(${form.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!form.imageUrl ? <ImagePlus className="h-8 w-8" /> : null}</div>
                <Label htmlFor="inventory-image" className="mt-2 flex h-9 cursor-pointer items-center justify-center rounded-xl border bg-background text-xs font-medium hover:bg-secondary">{isUploading ? "Subiendo..." : "Subir imagen"}</Label>
                <Input id="inventory-image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void handleImage(event.target.files?.[0])} />
              </div>
              <div className="space-y-4">
                <div className="space-y-2"><Label htmlFor="inventory-name">Nombre</Label><Input id="inventory-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Arrachera, vaso de 16 oz..." /></div>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2"><Label>Grupo</Label><Select value={form.categoryId || "none"} onValueChange={(value) => setForm({ ...form, categoryId: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin grupo</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
                  <Button type="button" variant="outline" className="self-end rounded-xl" onClick={() => setGroupOpen(true)}><Plus className="h-4 w-4" />Grupo</Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="inventory-unit">Unidad de medida</Label><Input id="inventory-unit" list="inventory-units" required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="pieza, kg, g, litro..." /><datalist id="inventory-units"><option value="unidad" /><option value="pieza" /><option value="kg" /><option value="g" /><option value="litro" /><option value="ml" /><option value="caja" /><option value="paquete" /></datalist><p className="text-xs text-muted-foreground">La receta utilizará exactamente esta unidad.</p></div>
              <div className="space-y-2"><Label htmlFor="inventory-cost">Costo por {form.unit || "unidad"}</Label><Input id="inventory-cost" type="number" min="0" step="0.01" value={form.costPerUnit} onChange={(event) => setForm({ ...form, costPerUnit: Number(event.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label htmlFor="inventory-quantity">Existencia {editing ? "actual" : "inicial"}</Label><Input id="inventory-quantity" type="number" min="0" step="0.001" disabled={Boolean(editing)} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) || 0 })} />{editing ? <p className="text-xs text-muted-foreground">Usa “Movimiento” para conservar el historial.</p> : null}</div>
              <div className="space-y-2"><Label htmlFor="inventory-minimum">Avisar cuando queden</Label><Input id="inventory-minimum" type="number" min="0" step="0.001" value={form.minimumQuantity} onChange={(event) => setForm({ ...form, minimumQuantity: Number(event.target.value) || 0 })} /></div>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-2xl border bg-amber-50/60 p-4"><div><p className="text-sm font-medium">Alerta de stock bajo</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Aparecerá en la campana del panel y, con permiso, como aviso del navegador.</p></div><Switch checked={form.lowStockAlertEnabled} onCheckedChange={(checked) => setForm({ ...form, lowStockAlertEnabled: checked })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={isSaving || isUploading}>{isSaving ? "Guardando..." : "Guardar artículo"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Nuevo grupo</DialogTitle><DialogDescription>Ejemplos: Carnes, verduras, empaques o bebidas.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={saveGroup}><div className="space-y-2"><Label htmlFor="group-name">Nombre</Label><Input id="group-name" required value={newGroup.name} onChange={(event) => setNewGroup({ ...newGroup, name: event.target.value })} placeholder="Ej. Carnes" /></div><div className="space-y-2"><Label htmlFor="group-color">Color</Label><div className="flex gap-3"><Input id="group-color" type="color" className="h-10 w-16 p-1" value={newGroup.color} onChange={(event) => setNewGroup({ ...newGroup, color: event.target.value })} /><div className="flex flex-1 items-center rounded-xl border px-3 text-sm text-muted-foreground">Se usará para identificar el grupo.</div></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setGroupOpen(false)}>Cancelar</Button><Button type="submit" disabled={isSaving}>Crear grupo</Button></DialogFooter></form></DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjusting)} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Movimiento de {adjusting?.name}</DialogTitle><DialogDescription>Registra entradas, mermas o correcciones; quedarán visibles en el historial.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={applyAdjustment}><div className="space-y-2"><Label>Tipo</Label><Select value={adjustment.movementType} onValueChange={(value) => setAdjustment({ ...adjustment, movementType: value as typeof adjustment.movementType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="purchase">Entrada o compra</SelectItem><SelectItem value="waste">Merma o consumo manual</SelectItem><SelectItem value="correction">Corrección (+ o -)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="inventory-adjustment">Cantidad ({adjusting?.unit})</Label><Input id="inventory-adjustment" type="number" min={adjustment.movementType === "correction" ? undefined : "0"} step="0.001" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: Number(event.target.value) || 0 })} /></div><div className="space-y-2"><Label htmlFor="movement-reason">Motivo o referencia</Label><Textarea id="movement-reason" value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} placeholder="Ej. Compra semanal, caducidad, conteo físico..." /></div><div className={`rounded-xl p-3 text-sm ${((adjusting?.quantity ?? 0) + adjustmentDelta()) < 0 ? "bg-red-50 text-red-700" : "bg-secondary/50"}`}>Resultado: {((adjusting?.quantity ?? 0) + adjustmentDelta()).toLocaleString("es-MX")} {adjusting?.unit}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setAdjusting(null)}>Cancelar</Button><Button type="submit" disabled={isSaving || !adjustment.amount || ((adjusting?.quantity ?? 0) + adjustmentDelta()) < 0}>Registrar</Button></DialogFooter></form></DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
