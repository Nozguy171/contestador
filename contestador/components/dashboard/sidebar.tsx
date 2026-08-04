"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Phone,
  UtensilsCrossed,
  Settings2,
  Building2,
  Users,
  Bot,
  FileText,
  ShoppingCart,
  ChefHat,
  Boxes,
  BrainCircuit,
  Tags,
} from "lucide-react"

const navigation = [
  { name: "Inicio", href: "/", icon: LayoutDashboard },
  { name: "Punto de venta", href: "/pos", icon: ShoppingCart },
  { name: "Pantalla de cocina", href: "/kds", icon: ChefHat },
  { name: "Pedidos", href: "/orders", icon: Phone },
  { name: "Gestión de menú", href: "/menu", icon: UtensilsCrossed },
  { name: "Inventario", href: "/inventory", icon: Boxes },
  { name: "Promociones", href: "/promotions", icon: Tags },
  { name: "Recomendaciones", href: "/insights", icon: BrainCircuit },
  { name: "Venta y entrega", href: "/rules", icon: Settings2 },
  { name: "Información del negocio", href: "/business", icon: Building2 },
  { name: "Historial de clientes", href: "/customers", icon: Users },
  { name: "Asistente de llamadas", href: "/bot", icon: Bot },
  { name: "Registro de llamadas", href: "/logs", icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">VoiceOrder</span>
            <span className="text-xs text-muted-foreground">Panel de control</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
