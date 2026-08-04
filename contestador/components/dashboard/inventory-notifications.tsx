"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Bell, BellRing, CheckCircle2, PackageSearch } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { listInventory } from "@/lib/api"
import type { InventoryItem } from "@/lib/types"

const NOTIFIED_KEY = "voiceorder_low_stock_notified"

export function InventoryNotifications() {
  const [lowStock, setLowStock] = useState<InventoryItem[]>([])
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")

  const refresh = useCallback(async () => {
    try {
      const items = await listInventory()
      const low = items.filter((item) => item.isLowStock)
      setLowStock(low)
      if (typeof window === "undefined" || !("Notification" in window)) return

      setPermission(Notification.permission)
      const previous = new Set<string>(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]"))
      const current = new Set(low.map((item) => item.id))
      if (Notification.permission === "granted") {
        low.filter((item) => !previous.has(item.id)).forEach((item) => {
          new Notification(`Stock bajo: ${item.name}`, {
            body: `Quedan ${item.quantity.toLocaleString("es-MX")} ${item.unit}. El mínimo es ${item.minimumQuantity.toLocaleString("es-MX")}.`,
            icon: item.imageUrl,
          })
        })
      }
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...current]))
    } catch {
      // Las alertas son auxiliares; cada pantalla conserva su propio manejo de errores.
    }
  }, [])

  useEffect(() => {
    if (!("Notification" in window)) setPermission("unsupported")
    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function enableNotifications() {
    if (!("Notification" in window)) {
      toast.error("Este navegador no admite avisos del sistema.")
      return
    }
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === "granted") {
      localStorage.removeItem(NOTIFIED_KEY)
      toast.success("Avisos de inventario activados.")
      await refresh()
    } else {
      toast.error("El navegador bloqueó los avisos. Puedes habilitarlos desde sus permisos.")
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void refresh()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Alertas de inventario">
          {lowStock.length ? <BellRing className="h-5 w-5 text-amber-600" /> : <Bell className="h-5 w-5" />}
          {lowStock.length ? (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full bg-amber-500 px-1 text-[10px] text-white">
              {lowStock.length > 9 ? "9+" : lowStock.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-2">
        <DropdownMenuLabel className="flex items-center justify-between px-2 py-2">
          <span>Alertas de inventario</span>
          {lowStock.length ? <Badge variant="secondary">{lowStock.length}</Badge> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 space-y-1 overflow-y-auto p-1">
          {lowStock.length ? lowStock.map((item) => (
            <Link key={item.id} href="/inventory" className="flex items-start gap-3 rounded-xl p-3 hover:bg-secondary/70">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <PackageSearch className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.quantity.toLocaleString("es-MX")} {item.unit} · mínimo {item.minimumQuantity.toLocaleString("es-MX")}
                </span>
              </span>
            </Link>
          )) : (
            <div className="px-3 py-7 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
              <p className="text-sm font-medium">Todo en orden</p>
              <p className="mt-1 text-xs text-muted-foreground">No hay artículos debajo de su mínimo.</p>
            </div>
          )}
        </div>
        {permission === "default" ? (
          <>
            <DropdownMenuSeparator />
            <Button variant="outline" size="sm" className="m-1 w-[calc(100%-0.5rem)] rounded-xl" onClick={() => void enableNotifications()}>
              Activar avisos del navegador
            </Button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
