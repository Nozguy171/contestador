"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import { createManualOrder, getBusinessSettings, listProducts, quoteManualOrder } from "@/lib/api"
import type { Category, PaymentMethod, Product, ProductModifier } from "@/lib/types"
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, Utensils } from "lucide-react"

type CartLine = {
  lineId: string
  product: Product
  quantity: number
  modifierIds: string[]
  modifiers: ProductModifier[]
  notes: string
}

function optionLabel(option: ProductModifier) {
  if (option.action === "remove") return `Sin ${option.name}`
  if (option.action === "add") return `Agregar ${option.name}`
  return option.name
}

function lineTotal(line: CartLine) {
  const extras = line.modifiers.reduce((sum, modifier) => sum + modifier.price, 0)
  return (line.product.price + extras) * line.quantity
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [quantity, setQuantity] = useState(1)
  const [itemNotes, setItemNotes] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [paymentOptions, setPaymentOptions] = useState<PaymentMethod[]>(["cash", "card", "online"])
  const [deliveryEnabled, setDeliveryEnabled] = useState(true)
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [orderNotes, setOrderNotes] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [createdFolio, setCreatedFolio] = useState("")
  const [createdPromotion, setCreatedPromotion] = useState("")
  const [quote, setQuote] = useState<{ subtotal: number; discount: number; promotionName?: string; deliveryFee: number; total: number } | null>(null)

  useEffect(() => {
    async function loadMenu() {
      try {
        const [data, settings] = await Promise.all([listProducts(), getBusinessSettings()])
        setProducts(data.products.filter((product) => product.isActive && !product.isSoldOut))
        setCategories(data.categories)
        setDeliveryEnabled(settings.delivery_enabled)
        const enabledPayments = [
          settings.accept_cash && !settings.require_prepayment ? "cash" : null,
          settings.accept_card ? "card" : null,
          settings.accept_online ? "online" : null,
        ].filter((method): method is PaymentMethod => method !== null)
        setPaymentOptions(enabledPayments)
        if (enabledPayments.length) setPaymentMethod(enabledPayments[0])
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el menú.")
      } finally {
        setIsLoading(false)
      }
    }
    void loadMenu()
  }, [])

  const visibleProducts = useMemo(
    () => products.filter((product) => {
      const matchesCategory = category === "all" || product.categoryId === category
      const query = search.toLowerCase()
      return matchesCategory && (!query || product.name.toLowerCase().includes(query) || product.description.toLowerCase().includes(query))
    }),
    [products, category, search]
  )
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0)

  useEffect(() => {
    if (!cart.length || !paymentOptions.length || (orderType === "delivery" && !deliveryAddress.trim())) {
      setQuote(null)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      void quoteManualOrder({
        customerName: customerName.trim() || undefined,
        type: orderType,
        paymentMethod,
        deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : undefined,
        notes: orderNotes.trim() || undefined,
        items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity, modifierIds: line.modifierIds, notes: line.notes || undefined })),
      }).then((nextQuote) => { if (active) setQuote(nextQuote) }).catch(() => { if (active) setQuote(null) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [cart, customerName, deliveryAddress, orderNotes, orderType, paymentMethod, paymentOptions.length])

  function openProduct(product: Product) {
    setSelectedProduct(product)
    setSelectedModifierIds([])
    setQuantity(1)
    setItemNotes("")
  }

  function addSelectedProduct() {
    if (!selectedProduct) return
    const modifiers = (selectedProduct.modifiers ?? []).filter((item) => selectedModifierIds.includes(item.id))
    const key = `${selectedProduct.id}:${[...selectedModifierIds].sort().join(",")}:${itemNotes.trim()}`
    setCart((current) => {
      const existing = current.find((line) => `${line.product.id}:${[...line.modifierIds].sort().join(",")}:${line.notes}` === key)
      if (existing) return current.map((line) => line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity } : line)
      return [...current, {
        lineId: crypto.randomUUID(),
        product: selectedProduct,
        quantity,
        modifierIds: [...selectedModifierIds].sort(),
        modifiers,
        notes: itemNotes.trim(),
      }]
    })
    setSelectedProduct(null)
  }

  async function submitOrder() {
    if (!cart.length) return
    try {
      setIsSubmitting(true)
      setErrorMessage("")
      setCreatedFolio("")
      setCreatedPromotion("")
      const order = await createManualOrder({
        customerName: customerName.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        type: orderType,
        paymentMethod,
        deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : undefined,
        notes: orderNotes.trim() || undefined,
        source: "pos",
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          modifierIds: line.modifierIds,
          notes: line.notes || undefined,
        })),
      })
      setCreatedFolio(order.folio)
      setCreatedPromotion(order.promotionName ?? "")
      setCart([])
      setCustomerName("")
      setPhoneNumber("")
      setDeliveryAddress("")
      setOrderNotes("")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear el pedido.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Punto de venta</h1>
          <p className="text-sm text-muted-foreground">Captura pedidos de mostrador con el mismo menú y validaciones que usa la llamada.</p>
        </div>

        {errorMessage ? <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent></Card> : null}
        {createdFolio ? <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex items-center gap-3 py-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" /><span>Pedido {createdFolio} enviado a cocina.{createdPromotion ? ` Se aplicó ${createdPromotion}.` : ""}</span></CardContent></Card> : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto..." className="rounded-xl pl-9" />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full rounded-xl sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas las categorías</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cargando menú...</CardContent></Card> : visibleProducts.length === 0 ? <Card><CardContent className="flex flex-col items-center py-12 text-center"><Utensils className="mb-3 h-10 w-10 text-muted-foreground/50" /><p>No hay productos disponibles.</p></CardContent></Card> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleProducts.map((product) => (
                  <button key={product.id} type="button" onClick={() => openProduct(product)} className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <div className="h-24 bg-gradient-to-br from-slate-100 to-slate-200" style={product.imageUrl ? { backgroundImage: `linear-gradient(to top,rgba(15,23,42,.3),transparent),url(${product.imageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3"><p className="font-semibold">{product.name}</p><p className="shrink-0 font-semibold text-primary">${product.price.toFixed(2)}</p></div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{product.description || "Sin descripción"}</p>
                      <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{product.category}</Badge>{product.modifiers?.length ? <Badge variant="secondary">Personalizable</Badge> : null}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card className="xl:sticky xl:top-6">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-5 w-5" />Pedido actual</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {cart.length === 0 ? <div className="rounded-xl bg-secondary/40 py-8 text-center text-sm text-muted-foreground">Selecciona productos para comenzar.</div> : (
                <div className="space-y-3">
                  {cart.map((line) => (
                    <div key={line.lineId} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{line.quantity} × {line.product.name}</p>{line.modifiers.map((modifier) => <p key={modifier.id} className="text-xs text-muted-foreground">{optionLabel(modifier)}</p>)}{line.notes ? <p className="mt-1 text-xs text-amber-700">{line.notes}</p> : null}</div><p className="text-sm font-semibold">${lineTotal(line).toFixed(2)}</p></div>
                      <div className="mt-3 flex items-center gap-2"><Button variant="outline" size="icon-sm" onClick={() => setCart((current) => current.map((item) => item.lineId === line.lineId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}><Minus className="h-3 w-3" /></Button><span className="w-6 text-center text-sm">{line.quantity}</span><Button variant="outline" size="icon-sm" onClick={() => setCart((current) => current.map((item) => item.lineId === line.lineId ? { ...item, quantity: item.quantity + 1 } : item))}><Plus className="h-3 w-3" /></Button><Button variant="ghost" size="icon-sm" className="ml-auto text-destructive" onClick={() => setCart((current) => current.filter((item) => item.lineId !== line.lineId))}><Trash2 className="h-4 w-4" /></Button></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 border-t border-border pt-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Cliente (opcional)" />
                  <Input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Teléfono (opcional)" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select value={orderType} onValueChange={(value) => setOrderType(value as "pickup" | "delivery")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pickup">Para recoger</SelectItem>{deliveryEnabled ? <SelectItem value="delivery">Entrega</SelectItem> : null}</SelectContent></Select>
                  <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)} disabled={!paymentOptions.length}><SelectTrigger><SelectValue placeholder="Sin métodos" /></SelectTrigger><SelectContent>{paymentOptions.includes("cash") ? <SelectItem value="cash">Efectivo</SelectItem> : null}{paymentOptions.includes("card") ? <SelectItem value="card">Tarjeta</SelectItem> : null}{paymentOptions.includes("online") ? <SelectItem value="online">En línea</SelectItem> : null}</SelectContent></Select>
                </div>
                {orderType === "delivery" ? <Input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Dirección de entrega" /> : null}
                <Textarea value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Notas generales (opcional)" className="min-h-20" />
              </div>

              <div className="space-y-2 border-t border-border pt-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>${(quote?.subtotal ?? subtotal).toFixed(2)}</span></div>{quote && quote.discount > 0 ? <div className="flex items-center justify-between gap-3 text-sm font-medium text-emerald-700"><span className="truncate">{quote.promotionName ?? "Promoción"}</span><span>-${quote.discount.toFixed(2)}</span></div> : null}{quote && quote.deliveryFee > 0 ? <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Envío</span><span>${quote.deliveryFee.toFixed(2)}</span></div> : null}<div className="mb-4 flex items-center justify-between border-t pt-3"><span className="font-medium">Total</span><span className="text-xl font-semibold">${(quote?.total ?? subtotal).toFixed(2)}</span></div><Button className="h-12 w-full rounded-xl" disabled={!cart.length || !paymentOptions.length || isSubmitting || (orderType === "delivery" && !deliveryAddress.trim())} onClick={() => void submitOrder()}>{isSubmitting ? "Enviando..." : "Enviar pedido a cocina"}</Button><p className="mt-2 text-center text-xs text-muted-foreground">Total validado por el backend; las promociones no se acumulan.</p></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>{selectedProduct?.name}</DialogTitle><DialogDescription>Elige personalizaciones y cantidad.</DialogDescription></DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {Object.entries(
              (selectedProduct?.modifiers ?? []).reduce<Record<string, ProductModifier[]>>(
                (groups, item) => ({
                  ...groups,
                  [item.groupName]: [...(groups[item.groupName] ?? []), item],
                }),
                {}
              )
            ).map(([groupName, options]) => (
              <div key={groupName} className="space-y-2"><p className="text-sm font-semibold">{groupName}</p>{options.map((option) => <label key={option.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3"><span className="flex items-center gap-3"><Checkbox checked={selectedModifierIds.includes(option.id)} onCheckedChange={(checked) => setSelectedModifierIds((current) => { if (!checked) return current.filter((id) => id !== option.id); const compatible = option.action === "choice" ? current.filter((id) => { const selected = selectedProduct?.modifiers?.find((item) => item.id === id); return selected?.action !== "choice" || selected.groupName !== option.groupName }) : current; return [...compatible, option.id] })} /><span><span className="block text-sm font-medium">{optionLabel(option)}</span><span className="text-xs capitalize text-muted-foreground">{option.action === "choice" ? "Elige una" : option.action === "add" ? "Adicional" : "Ingrediente removible"}</span></span></span><span className="text-sm">{option.price ? `+$${option.price.toFixed(2)}` : "Sin costo"}</span></label>)}</div>
            ))}
            <div className="flex items-center justify-between rounded-xl border border-border p-3"><Label>Cantidad</Label><div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon-sm" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-3 w-3" /></Button><span className="w-8 text-center">{quantity}</span><Button type="button" variant="outline" size="icon-sm" onClick={() => setQuantity(quantity + 1)}><Plus className="h-3 w-3" /></Button></div></div>
            <Textarea value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} placeholder="Nota para cocina (opcional)" />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSelectedProduct(null)}>Cancelar</Button><Button onClick={addSelectedProduct}>Agregar al pedido</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
