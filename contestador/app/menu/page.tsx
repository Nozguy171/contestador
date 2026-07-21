"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { ProductFormDialog } from "@/components/menu/product-form-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  createCategory,
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "@/lib/api"
import type { Product, Category } from "@/lib/types"
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  UtensilsCrossed,
  AlertCircle,
} from "lucide-react"

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  async function loadMenu() {
    try {
      setIsLoading(true)
      setErrorMessage("")
      const data = await listProducts()
      setCategories(data.categories)
      setProducts(data.products)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el menú.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadMenu()
  }, [])

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory =
        selectedCategory === "all" || product.categoryId === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, selectedCategory])

  const handleSaveProduct = async (productData: Partial<Product>) => {
    const payload = {
      name: productData.name || "",
      description: productData.description || "",
      categoryId: productData.categoryId || undefined,
      price: productData.price || 0,
      isActive: productData.isActive ?? true,
      isSoldOut: productData.isSoldOut ?? false,
      modifiers: (productData.modifiers ?? [])
        .filter((modifier) => modifier.name.trim())
        .map((modifier) => ({ name: modifier.name.trim(), price: modifier.price })),
    }

    if (editingProduct) {
      await updateProduct(editingProduct.id, payload)
    } else {
      await createProduct(payload)
    }

    await loadMenu()
    setEditingProduct(null)
  }

  const handleCreateCategory = async (payload: { name: string }) => {
    const category = await createCategory(payload)
    await loadMenu()
    return category
  }

  const handleDeleteProduct = async () => {
    try {
      if (productToDelete) {
        await deleteProduct(productToDelete.id)
        await loadMenu()
        setProductToDelete(null)
      }
      setDeleteDialogOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar el producto.")
    }
  }

  const toggleProductActive = async (product: Product) => {
    try {
      await updateProduct(product.id, {
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        price: product.price,
        isActive: !product.isActive,
        isSoldOut: product.isSoldOut,
      })
      await loadMenu()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar el producto.")
    }
  }

  const toggleProductSoldOut = async (product: Product) => {
    try {
      await updateProduct(product.id, {
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        price: product.price,
        isActive: product.isActive,
        isSoldOut: !product.isSoldOut,
      })
      await loadMenu()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar el producto.")
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Gestión de menú</h1>
            <p className="text-sm text-muted-foreground">
              Administra tus productos, categorías y disponibilidad.
            </p>
          </div>
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditingProduct(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar producto
          </Button>
        </div>

        {errorMessage ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        {/* Search and Categories */}
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Todos los productos
                <Badge variant="secondary" className="ml-2 text-xs">
                  {products.length}
                </Badge>
              </TabsTrigger>
              {categories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {category.name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {products.filter((p) => p.categoryId === category.id).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UtensilsCrossed className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm">Cargando productos...</p>
            </CardContent>
          </Card>
        ) : filteredProducts.length === 0 ? (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UtensilsCrossed className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
              <p className="text-muted-foreground/70 text-xs mt-1">
                Prueba ajustando la búsqueda o el filtro por categoría.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className={`gap-0 border-border py-0 shadow-sm transition-all duration-200 hover:shadow-md ${
                  !product.isActive ? "opacity-60" : ""
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                        {product.isSoldOut && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            Agotado
                          </Badge>
                        )}
                        {!product.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {product.category}
                        </Badge>
                        {product.modifiers?.length ? (
                          <Badge variant="secondary" className="text-xs">
                            {product.modifiers.length} opciones
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {product.description}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0 rounded-xl">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem
                          className="rounded-lg"
                          onClick={() => {
                            setEditingProduct(product)
                            setFormOpen(true)
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-lg text-destructive"
                          onClick={() => {
                            setProductToDelete(product)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-lg font-semibold text-foreground">
                        ${product.price}
                      </span>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Agotado</span>
                          <Switch
                            checked={product.isSoldOut}
                            onCheckedChange={() => void toggleProductSoldOut(product)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Activo</span>
                          <Switch
                            checked={product.isActive}
                            onCheckedChange={() => void toggleProductActive(product)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingProduct(null)
        }}
        product={editingProduct}
        categories={categories}
        onSave={handleSaveProduct}
        onCreateCategory={handleCreateCategory}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar &quot;{productToDelete?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteProduct()} className="rounded-xl bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
