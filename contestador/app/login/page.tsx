"use client"

import { FormEvent, Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Mail, Lock, ArrowRight, PhoneCall, Loader2 } from "lucide-react"
import { getStoredToken, loginRequest, persistSession } from "@/lib/api"

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const nextEmail = searchParams.get("email")
    if (nextEmail) {
      setEmail(nextEmail)
    }
  }, [searchParams])

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/")
    }
  }, [router])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage("")

    if (!email.trim() || !password.trim()) {
      setErrorMessage("Ingresa tu correo y tu contraseña.")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await loginRequest(email.trim(), password)
      persistSession(response.data, { rememberMe })

      router.push("/")
      router.refresh()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo iniciar sesión."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-border bg-secondary/40 lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_35%)]" />
          <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <PhoneCall className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">VoiceOrder AI</p>
                <p className="text-xs text-muted-foreground">
                  Gestión inteligente de pedidos por llamada
                </p>
              </div>
            </div>

            <div className="max-w-xl space-y-6">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
                  Inicia sesión y administra tus pedidos con una experiencia limpia y profesional
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  Accede a tu panel para revisar llamadas, pedidos, métricas y operación diaria
                  en un solo lugar.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background/80 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-foreground">24/7</p>
                  <p className="text-sm text-muted-foreground">Atención automatizada</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/80 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-foreground">IA</p>
                  <p className="text-sm text-muted-foreground">Atendiendo llamadas y pedidos</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/80 p-4 backdrop-blur">
                  <p className="text-2xl font-semibold text-foreground">Todo</p>
                  <p className="text-sm text-muted-foreground">Centralizado en un panel</p>
                </div>
              </div>
            </div>

            <div />
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <PhoneCall className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">VoiceOrder AI</p>
                <p className="text-xs text-muted-foreground">Bienvenido de nuevo</p>
              </div>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  Iniciar sesión
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Ingresa tus datos para acceder a tu panel.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="tu@negocio.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                      Contraseña
                    </label>

                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Recordarme
                    </label>
                  </div>

                  {errorMessage ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  <Button className="h-11 w-full rounded-xl" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      <>
                        Entrar
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    ¿No tienes cuenta?{" "}
                    <Link
                      href="/signup"
                      className="font-medium text-primary transition hover:opacity-80"
                    >
                      Crear cuenta
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
