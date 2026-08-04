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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(13,148,136,0.08),transparent_28rem),linear-gradient(to_bottom,#f8fafc,#f1f5f9)] dark:bg-background">
      <Sidebar />
      <div className="min-w-0 lg:pl-64">
        <Topbar />
        <main className="mx-auto min-w-0 max-w-[1600px] p-3 sm:p-5 lg:p-7">{children}</main>
      </div>
    </div>
  )
}
