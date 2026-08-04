"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, ChevronDown, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { MobileSidebar } from "./mobile-sidebar"
import { clearSession, getStoredBusinesses, getStoredUser } from "@/lib/api"
import { InventoryNotifications } from "./inventory-notifications"

export function Topbar() {
  const router = useRouter()
  const [userName, setUserName] = useState("Usuario")
  const [userRole, setUserRole] = useState("Propietario")
  const [businessName, setBusinessName] = useState("Mi negocio")

  useEffect(() => {
    const user = getStoredUser()
    const businesses = getStoredBusinesses()

    if (user?.name) {
      setUserName(user.name)
    }

    if (businesses.length > 0) {
      setBusinessName(businesses[0].name)
      setUserRole("Propietario")
    }
  }, [])

  function handleSignOut() {
    clearSession()
    router.replace("/login")
  }

  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "VO"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menú</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(18rem,calc(100vw-1rem))] gap-0 p-0">
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <SheetDescription className="sr-only">
              Navega entre las secciones principales del panel.
            </SheetDescription>
            <MobileSidebar />
          </SheetContent>
        </Sheet>

        <div className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Negocio</span>
            <span className="text-sm font-medium">{businessName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <InventoryNotifications />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-xl hover:bg-secondary">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{userName}</span>
                <span className="text-xs text-muted-foreground">{userRole}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg text-destructive" onClick={handleSignOut}>
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
