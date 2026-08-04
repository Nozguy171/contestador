"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import type { Category, InventoryItem, Product } from "@/lib/types"
import { uploadImage } from "@/lib/api"
import { Boxes, ImagePlus, Plus, Trash2 } from "lucide-react"

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  categories: Category[]
  inventoryItems: InventoryItem[]
  onSave: (product: Partial<Product>) => Promise<void> | void
  onCreateCategory: (payload: { name: string }) => Promise<Category>
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  inventoryItems,
  onSave,
  onCreateCategory,
}: ProductFormDialogProps) {
  const [formData, setFormData] = useState<Partial<Product>>({
    name: "",
    description: "",
    category: "",
    categoryId: "",
    price: 0,
    isActive: true,
    isSoldOut: false,
    modifiers: [],
    ingredients: [],
    imageUrl: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState("")
  const [formError, setFormError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const initializedForOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      initializedForOpen.current = false
      return
    }
    if (initializedForOpen.current) return
    initializedForOpen.current = true
    setFormError("")
    if (product) {
      setFormData(product)
      return
    }

    setFormData({
      name: "",
      description: "",
      category: categories[0]?.name || "Sin categoría",
      categoryId: categories[0]?.id || "",
      price: 0,
      isActive: true,
      isSoldOut: false,
      modifiers: [],
      ingredients: [],
      imageUrl: "",
    })
  }, [open, product, categories])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setIsSubmitting(true)
      setFormError("")
      await onSave(formData)
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar el producto.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim()

    if (!trimmedName) {
      setCategoryError("Escribe un nombre para la categoría.")
      return
    }

    try {
      setIsCreatingCategory(true)
      setCategoryError("")
      const category = await onCreateCategory({ name: trimmedName })
      setFormData((current) => ({
        ...current,
        categoryId: category.id,
        category: category.name,
      }))
      setNewCategoryName("")
    } catch (error) {
      setCategoryError(
        error instanceof Error ? error.message : "No se pudo crear la categoría."
      )
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleImage = async (file?: File) => {
    if (!file) return
    try {
      setIsUploading(true)
      setFormError("")
      const imageUrl = await uploadImage(file)
      setFormData((current) => ({ ...current, imageUrl }))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo subir la imagen.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl xl:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-14 text-left sm:px-6 sm:pr-16">
          <DialogTitle>{product ? "Editar producto" : "Agregar producto"}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para crear o editar un producto del menú.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid items-start gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] xl:gap-6">
              <div className="min-w-0 space-y-5">
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Detalles del producto</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Define cómo aparecerá el producto en el menú y cómo lo entenderá el asistente.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre del producto</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej. Tacos al pastor"
                        className="rounded-xl"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Descripción</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Describe el producto..."
                        className="min-h-[120px] rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Categoría</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Asigna una categoría existente o crea una nueva sin salir de esta ventana.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Seleccionar categoría</Label>
                      <Select
                        value={formData.categoryId || "uncategorized"}
                        onValueChange={(value) => {
                          const selectedCategory = categories.find((category) => category.id === value)
                          setFormData({
                            ...formData,
                            categoryId: value === "uncategorized" ? "" : value,
                            category: selectedCategory?.name || "Sin categoría",
                          })
                        }}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="uncategorized" className="rounded-lg">
                            Sin categoría
                          </SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id} className="rounded-lg">
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        Crear categoría nueva
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Útil cuando estás cargando un producto nuevo y todavía no existe su categoría.
                      </p>
                      <div className="mt-4 flex flex-col gap-3">
                        <Input
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Ej. Bebidas, postres, combos..."
                          className="rounded-xl"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full rounded-xl"
                          disabled={isCreatingCategory}
                          onClick={() => void handleCreateCategory()}
                        >
                          Crear categoría
                        </Button>
                      </div>
                      {categoryError ? (
                        <p className="mt-3 text-xs text-red-600">{categoryError}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Personalizaciones</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Agrupa opciones para elegir, agregar o quitar ingredientes. Las mismas opciones se usan en voz y POS.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 rounded-xl"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          modifiers: [
                            ...(formData.modifiers ?? []),
                            {
                              id: crypto.randomUUID(),
                              name: "",
                              price: 0,
                              groupName: "Ingredientes",
                              action: "add",
                            },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(formData.modifiers ?? []).map((modifier, index) => (
                      <div key={modifier.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.8fr)_150px_minmax(160px,1fr)_110px_auto] xl:items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`modifier-group-${modifier.id}`}>Grupo</Label>
                          <Input
                            id={`modifier-group-${modifier.id}`}
                            value={modifier.groupName}
                            placeholder="Ej. Ingredientes"
                            required
                            onChange={(event) => {
                              const modifiers = [...(formData.modifiers ?? [])]
                              modifiers[index] = { ...modifier, groupName: event.target.value }
                              setFormData({ ...formData, modifiers })
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Acción</Label>
                          <Select
                            value={modifier.action}
                            onValueChange={(value) => {
                              const action = value as "choice" | "add" | "remove"
                              const modifiers = [...(formData.modifiers ?? [])]
                              modifiers[index] = {
                                ...modifier,
                                action,
                                price: action === "remove" ? 0 : modifier.price,
                              }
                              setFormData({ ...formData, modifiers })
                            }}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="choice">Elegir</SelectItem>
                              <SelectItem value="add">Agregar</SelectItem>
                              <SelectItem value="remove">Quitar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`modifier-name-${modifier.id}`}>Opción o ingrediente</Label>
                          <Input
                            id={`modifier-name-${modifier.id}`}
                            value={modifier.name}
                            placeholder="Ej. Cebolla o tamaño grande"
                            required
                            onChange={(event) => {
                              const modifiers = [...(formData.modifiers ?? [])]
                              modifiers[index] = { ...modifier, name: event.target.value }
                              setFormData({ ...formData, modifiers })
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`modifier-price-${modifier.id}`}>Precio</Label>
                          <Input
                            id={`modifier-price-${modifier.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={modifier.price}
                            disabled={modifier.action === "remove"}
                            onChange={(event) => {
                              const modifiers = [...(formData.modifiers ?? [])]
                              modifiers[index] = {
                                ...modifier,
                                price: Number(event.target.value) || 0,
                              }
                              setFormData({ ...formData, modifiers })
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="justify-self-end rounded-xl text-destructive md:justify-self-auto"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              modifiers: (formData.modifiers ?? []).filter((_, itemIndex) => itemIndex !== index),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Eliminar modificador</span>
                        </Button>
                      </div>
                    ))}
                    {(formData.modifiers ?? []).length === 0 ? (
                      <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
                        Este producto no tiene personalizaciones.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Receta e inventario</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Opcional. Al confirmar un pedido se descontarán estas cantidades por cada unidad vendida.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 rounded-xl"
                      disabled={!inventoryItems.length}
                      onClick={() => {
                        const selected = new Set((formData.ingredients ?? []).map((ingredient) => ingredient.inventoryItemId))
                        const inventoryItem = inventoryItems.find((item) => item.isActive && !selected.has(item.id))
                        if (!inventoryItem) {
                          setFormError("No hay más artículos disponibles para agregar a la receta.")
                          return
                        }
                        setFormData({
                          ...formData,
                          ingredients: [
                            ...(formData.ingredients ?? []),
                            {
                              id: crypto.randomUUID(),
                              inventoryItemId: inventoryItem.id,
                              inventoryItemName: inventoryItem.name,
                              unit: inventoryItem.unit,
                              quantity: 1,
                            },
                          ],
                        })
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />Ingrediente
                    </Button>
                  </div>
                  {!inventoryItems.length ? (
                    <div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <Boxes className="mt-0.5 h-4 w-4 shrink-0" />
                      Primero agrega materias primas en Inventario. Puedes guardar este producto sin receta.
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {(formData.ingredients ?? []).map((ingredient, index) => (
                      <div key={ingredient.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(180px,1fr)_150px_auto] sm:items-end">
                        <div className="space-y-2">
                          <Label>Artículo de inventario</Label>
                          <Select
                            value={ingredient.inventoryItemId}
                            onValueChange={(value) => {
                              const item = inventoryItems.find((candidate) => candidate.id === value)
                              const ingredients = [...(formData.ingredients ?? [])]
                              ingredients[index] = {
                                ...ingredient,
                                inventoryItemId: value,
                                inventoryItemName: item?.name ?? "",
                                unit: item?.unit ?? "unidad",
                              }
                              setFormData({ ...formData, ingredients })
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {inventoryItems.map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  disabled={(formData.ingredients ?? []).some((row, rowIndex) => rowIndex !== index && row.inventoryItemId === item.id)}
                                >
                                  {item.name} · {item.unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`ingredient-quantity-${ingredient.id}`}>Cantidad ({ingredient.unit})</Label>
                          <Input
                            id={`ingredient-quantity-${ingredient.id}`}
                            type="number"
                            min="0.001"
                            step="0.001"
                            required
                            value={ingredient.quantity}
                            onChange={(event) => {
                              const ingredients = [...(formData.ingredients ?? [])]
                              ingredients[index] = { ...ingredient, quantity: Number(event.target.value) || 0 }
                              setFormData({ ...formData, ingredients })
                            }}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="justify-self-end rounded-xl text-destructive" onClick={() => setFormData({ ...formData, ingredients: (formData.ingredients ?? []).filter((_, itemIndex) => itemIndex !== index) })}>
                          <Trash2 className="h-4 w-4" /><span className="sr-only">Quitar ingrediente</span>
                        </Button>
                      </div>
                    ))}
                    {(formData.ingredients ?? []).length === 0 && inventoryItems.length ? (
                      <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">Sin receta: este producto no descontará inventario automáticamente.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-5">
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Imagen</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Se mostrará en el menú, POS y futuro kiosco.</p>
                  </div>
                  <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-dashed bg-secondary/40" style={formData.imageUrl ? { backgroundImage: `url(${formData.imageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
                    {!formData.imageUrl ? <div className="grid h-full place-items-center text-muted-foreground"><ImagePlus className="h-8 w-8" /></div> : null}
                  </div>
                  <Label htmlFor="product-image" className="mt-3 flex h-9 cursor-pointer items-center justify-center rounded-xl border bg-background text-xs font-medium hover:bg-secondary">
                    {isUploading ? "Subiendo..." : formData.imageUrl ? "Cambiar imagen" : "Subir imagen"}
                  </Label>
                  <Input id="product-image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void handleImage(event.target.files?.[0])} />
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Precio y disponibilidad</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Controla cuánto cuesta y si el producto aparece disponible en el menú.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Precio</Label>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                        }
                        className="rounded-xl"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Disponibilidad</Label>
                      <Select
                        value={
                          formData.isActive
                            ? "available"
                            : formData.isSoldOut
                              ? "sold_out"
                              : "hidden"
                        }
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            isActive: value === "available",
                            isSoldOut: value === "sold_out",
                          })
                        }
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Disponible para vender</SelectItem>
                          <SelectItem value="sold_out">Agotado temporalmente</SelectItem>
                          <SelectItem value="hidden">Oculto del menú</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Sólo puede tener un estado a la vez.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {formError ? (
            <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:px-6">
              {formError}
            </p>
          ) : null}
          <DialogFooter className="shrink-0 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl sm:min-w-36"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" className="rounded-xl sm:min-w-44" disabled={isSubmitting || isUploading}>
              {isSubmitting ? "Guardando..." : product ? "Guardar cambios" : "Agregar producto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
