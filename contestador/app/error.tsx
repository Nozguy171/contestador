"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-xl shadow-slate-200/50">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold">Algo no salió como esperábamos</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No se perdió información. Vuelve a intentarlo y, si continúa, recarga la página.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground">Referencia: {error.digest}</p>
        ) : null}
        <Button className="mt-6 w-full rounded-xl" onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Intentar de nuevo
        </Button>
      </section>
    </main>
  )
}
