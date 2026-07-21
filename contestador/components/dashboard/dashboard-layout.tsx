"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { getStoredToken } from "@/lib/api"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login")
      return
    }

    setIsReady(true)
  }, [router])

  if (!isReady) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="min-w-0 lg:pl-64">
        <Topbar />
        <main className="min-w-0 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
