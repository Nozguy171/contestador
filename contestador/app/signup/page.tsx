"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Mail, Lock, Store, ArrowRight, Sparkles, Loader2 } from "lucide-react"
import { getStoredToken, persistSession, registerRequest } from "@/lib/api"

export default function SignupPage() {
  const router = useRouter()

  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [negocio, setNegocio] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/")
    }
  }, [router])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage("")
    setSuccessMessage("")

    if (!nombre.trim() || !negocio.trim() || !email.trim() || !password.trim()) {
      setErrorMessage("Completa los campos obligatorios.")
      return
    }

    if (password.length < 8) {
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.")
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.")
      return
    }

    if (!acceptedTerms) {
      setErrorMessage("Debes aceptar los términos y condiciones.")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await registerRequest(
        nombre.trim(),
        apellido.trim(),
        email.trim(),
        password,
        negocio.trim(),
        acceptedTerms
      )

      persistSession(response.data)
      setSuccessMessage("Cuenta creada correctamente.")
      router.push("/")
      router.refresh()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo crear la cuenta."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">VoiceOrder AI</p>
                <p className="text-xs text-muted-foreground">Crea tu cuenta</p>
              </div>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  Crear cuenta
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Registra tu negocio y comienza a gestionar pedidos con IA.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="nombre" className="text-sm font-medium text-foreground">
                        Nombre
                      </label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="nombre"
                          name="nombre"
                          type="text"
                          placeholder="Juan"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="apellido" className="text-sm font-medium text-foreground">
                        Apellido
                      </label>
                      <input
                        id="apellido"
                        name="apellido"
                        type="text"
                        placeholder="Pérez"
                        value={apellido}
                        onChange={(e) => setApellido(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="negocio" className="text-sm font-medium text-foreground">
                      Nombre del negocio
                    </label>
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="negocio"
                        name="negocio"
                        type="text"
                        placeholder="Tacos El Compa"
                        value={negocio}
                        onChange={(e) => setNegocio(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este negocio se creará automáticamente al registrar tu cuenta.
                    </p>
                  </div>

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

                  <div className="grid gap-5 sm:grid-cols-2">
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
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="confirmPassword"
                        className="text-sm font-medium text-foreground"
                      >
                        Confirmar contraseña
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/35 p-4 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Acepto los términos y condiciones y el aviso de privacidad.</span>
                  </label>

                  {errorMessage ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  {successMessage ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {successMessage}
                    </div>
                  ) : null}

                  <Button className="h-11 w-full rounded-xl" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creando cuenta...
                      </>
                    ) : (
                      <>
                        Crear cuenta
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    ¿Ya tienes cuenta?{" "}
                    <Link
                      href="/login"
                      className="font-medium text-primary transition hover:opacity-80"
                    >
                      Inicia sesión
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="relative hidden overflow-hidden border-l border-border bg-secondary/40 lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_35%)]" />
          <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">VoiceOrder AI</p>
                <p className="text-xs text-muted-foreground">
                  Operación moderna para restaurantes
                </p>
              </div>
            </div>

            <div className="max-w-xl space-y-6">
              <div className="space-y-4">
                <h2 className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
                  Crea tu cuenta y empieza a centralizar llamadas, pedidos y métricas
                </h2>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  Una interfaz elegante para negocios que quieren automatizar la toma de
                  pedidos telefónicos sin perder control operativo.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-background/80 p-5 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">
                    Configuración sencilla
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registra tu negocio y deja lista tu cuenta para comenzar sin fricción.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-background/80 p-5 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">
                    Mejor control operativo
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Supervisa pedidos, llamadas y rendimiento desde una sola plataforma.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-background/80 p-5 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">
                    Base lista para escalar
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Empieza con una experiencia sólida y prepara tu operación para crecer.
                  </p>
                </div>
              </div>
            </div>

            <div />
          </div>
        </section>
      </div>
    </main>
  )
}
