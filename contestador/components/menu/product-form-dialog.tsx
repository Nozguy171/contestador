"use client"

import { useEffect, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Category, Product } from "@/lib/types"
import { Plus, Trash2 } from "lucide-react"

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  categories: Category[]
  onSave: (product: Partial<Product>) => Promise<void> | void
  onCreateCategory: (payload: { name: string }) => Promise<Category>
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
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
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState("")
  const [formError, setFormError] = useState("")

  useEffect(() => {
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
    })
  }, [product, categories])

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
                      <h3 className="text-sm font-semibold text-foreground">Modificadores</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Opciones que Gemini puede ofrecer, como queso extra o tamaño grande.
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
                            { id: crypto.randomUUID(), name: "", price: 0 },
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
                      <div key={modifier.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`modifier-name-${modifier.id}`}>Nombre</Label>
                          <Input
                            id={`modifier-name-${modifier.id}`}
                            value={modifier.name}
                            placeholder="Ej. Con queso"
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
                        Este producto no tiene modificadores.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-5">
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

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                      <div className="min-w-0 space-y-0.5">
                        <Label htmlFor="active" className="text-sm font-medium">
                          Activo
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          El producto se muestra y se puede pedir.
                        </p>
                      </div>
                      <Switch
                        id="active"
                        className="shrink-0"
                        checked={formData.isActive}
                        onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                      <div className="min-w-0 space-y-0.5">
                        <Label htmlFor="soldout" className="text-sm font-medium">
                          Agotado
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          El producto existe pero temporalmente no se puede vender.
                        </p>
                      </div>
                      <Switch
                        id="soldout"
                        className="shrink-0"
                        checked={formData.isSoldOut}
                        onCheckedChange={(checked) => setFormData({ ...formData, isSoldOut: checked })}
                      />
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
            <Button type="submit" className="rounded-xl sm:min-w-44" disabled={isSubmitting}>
              {product ? "Guardar cambios" : "Agregar producto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
