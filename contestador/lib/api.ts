const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:18763"

export const STORAGE_KEYS = {
  token: "voiceorder_token",
  businessId: "voiceorder_business_id",
  user: "voiceorder_user",
  businesses: "voiceorder_businesses",
} as const

type RequestOptions = RequestInit & {
  auth?: boolean
  businessId?: string | number | null
}

function setStoredBusinessId(businessId: string) {
  if (typeof window === "undefined") return

  if (sessionStorage.getItem(STORAGE_KEYS.token)) {
    sessionStorage.setItem(STORAGE_KEYS.businessId, businessId)
  }

  if (localStorage.getItem(STORAGE_KEYS.token)) {
    localStorage.setItem(STORAGE_KEYS.businessId, businessId)
  }
}

function setStoredBusinesses(businesses: unknown[], user?: unknown) {
  if (typeof window === "undefined") return

  if (sessionStorage.getItem(STORAGE_KEYS.token)) {
    sessionStorage.setItem(STORAGE_KEYS.businesses, JSON.stringify(businesses))
    if (user) sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
  }

  if (localStorage.getItem(STORAGE_KEYS.token)) {
    localStorage.setItem(STORAGE_KEYS.businesses, JSON.stringify(businesses))
    if (user) localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
  }
}

async function resolveBusinessIdFromProfile(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || "No se pudo recuperar la sesión.")
  }

  const businesses = payload?.data?.businesses ?? []
  const user = payload?.data?.user

  setStoredBusinesses(businesses, user)

  if (!businesses.length) {
    throw new Error("No tienes un negocio configurado todavía. Primero crea o asigna un negocio.")
  }

  const businessId = String(businesses[0].id)
  setStoredBusinessId(businessId)
  return businessId
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { auth = false, businessId, headers, ...rest } = options

  const finalHeaders = new Headers(headers || {})
  finalHeaders.set("Content-Type", "application/json")

  if (auth && typeof window !== "undefined") {
    const token = getStoredValue(STORAGE_KEYS.token)
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`)
      let resolvedBusinessId =
        businessId ?? getStoredValue(STORAGE_KEYS.businessId)

      if (!resolvedBusinessId && path !== "/api/v1/auth/me") {
        resolvedBusinessId = await resolveBusinessIdFromProfile(token)
      }

      if (resolvedBusinessId) {
        finalHeaders.set("X-Business-Id", String(resolvedBusinessId))
      }
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && auth && typeof window !== "undefined") {
      clearSession()
      if (window.location.pathname !== "/login") {
        window.location.assign("/login")
      }
    }
    throw new Error(data?.message || "Ocurrió un error inesperado")
  }

  return data as T
}

export type LoginResponse = {
  message: string
  data: {
    access_token: string
    user: {
      id: number
      name: string
      email: string
      is_active: boolean
      created_at?: string
      updated_at?: string
    }
    businesses: Array<{
      id: number
      name: string
      role: string
      email?: string | null
      phone?: string | null
      address?: string | null
    }>
  }
}

export type RegisterResponse = {
  message: string
  data: {
    access_token: string
    user: {
      id: number
      name: string
      email: string
      is_active: boolean
      created_at?: string
      updated_at?: string
    }
    businesses: Array<{
      id: number
      name: string
      role: string
      email?: string | null
      phone?: string | null
      address?: string | null
    }>
  }
}

type BackendOrder = {
  id: number
  folio: string
  customer_name: string
  phone_number: string
  type: "pickup" | "delivery"
  items: Array<{
    id: number
    name_snapshot: string
    quantity: number
    price: string | number
    line_total: string | number
    notes?: string | null
    modifiers?: Array<{
      id: number
      name_snapshot: string
      price: string | number
    }>
  }>
  subtotal: string | number
  delivery_fee: string | number
  total: string | number
  status:
    | "new"
    | "confirmed"
    | "preparing"
    | "ready"
    | "out_for_delivery"
    | "delivered"
    | "cancelled"
  created_at: string
  delivery_address?: string | null
  notes?: string | null
  payment_method: "cash" | "card" | "online"
  ai_call_summary?: string | null
  transcript_preview?: string | null
  status_history: Array<{
    status:
      | "new"
      | "confirmed"
      | "preparing"
      | "ready"
      | "out_for_delivery"
      | "delivered"
      | "cancelled"
    created_at: string
    changed_by_label?: string | null
  }>
}

type BackendCall = {
  id: number
  phone_number: string
  start_time: string
  end_time?: string | null
  duration_seconds?: number | null
  status: "completed" | "failed" | "dropped" | "incomplete"
  resulted_in_order: boolean
  order_id?: number | null
  transcript?: string | null
  ai_summary?: string | null
  confidence?: string | number | null
  error_flags: Array<{ flag: string }>
  tool_calls: Array<{ tool_name: string }>
  session_state: "connecting" | "active" | "order_submitted" | "transferring" | "transferred" | "ended"
  transfer_requested: boolean
  draft_cart?: {
    revision?: number
    items?: Array<{
      line_id: string
      product_id: number
      name: string
      quantity: number
      unit_price: string | number
      line_total: string | number
      modifiers?: Array<{ id: number; name: string; price: string | number }>
    }>
    quote?: {
      subtotal: string | number
      delivery_fee: string | number
      total: string | number
      order_type: "pickup" | "delivery"
      payment_method: "cash" | "card" | "online"
    } | null
  } | null
}

type BackendCustomer = {
  id: number
  customer_name: string
  phone_number: string
  total_orders: number
  total_calls: number
  total_spent: string | number
  average_order_value: string | number
  last_activity_at?: string | null
  most_ordered_items: string[]
  addresses: string[]
  order_history: BackendOrder[]
}

type BackendCategory = {
  id: number
  name: string
  description?: string | null
  product_count: number
}

type BackendProduct = {
  id: number
  category_id?: number | null
  name: string
  description?: string | null
  price: string | number
  image_url?: string | null
  is_active: boolean
  is_sold_out: boolean
  modifiers?: Array<{
    id: number
    name: string
    price: string | number
  }>
}

type BackendBusiness = {
  id: number
  name: string
  address?: string | null
  phone?: string | null
  twilio_phone_number?: string | null
  human_transfer_number?: string | null
  email?: string | null
  estimated_delivery_time?: string | null
}

type BackendBusinessHour = {
  id?: number
  day_of_week: number
  open_time?: string | null
  close_time?: string | null
  is_closed: boolean
}

type BackendBusinessSetting = {
  delivery_enabled: boolean
  minimum_order_delivery?: string | number | null
  delivery_fee?: string | number | null
  free_delivery_threshold?: string | number | null
  estimated_prep_time_minutes?: number | null
  accept_cash: boolean
  accept_card: boolean
  accept_online: boolean
  cash_only_threshold?: string | number | null
  require_prepayment: boolean
}

type BackendFAQ = {
  id: number
  category?: string | null
  question: string
  answer: string
  sort_order?: number
  is_active: boolean
}

type BackendBotConfig = {
  welcome_message?: string | null
  after_hours_message?: string | null
  fallback_message?: string | null
  confirmation_required: boolean
  retry_count: number
  unavailable_behavior: "skip" | "suggest_alternative" | "ask_customer"
  can_suggest_alternatives: boolean
  tone: "formal" | "friendly" | "casual"
  special_instructions?: string | null
}

type BackendMenuRule = {
  id: number
  name: string
  type: "time_restriction" | "delivery_rule" | "combo_rule" | "modifier_rule" | "payment_rule"
  description?: string | null
  is_active: boolean
  config: Record<string, unknown>
}

export type VoiceRuntimeStatus = {
  ready: boolean
  twilio: {
    ready: boolean
    phone_number?: string | null
    inbound_url?: string | null
    stream_url?: string | null
    transport: "bidirectional_media_streams"
    tenant_number_configured: boolean
    human_transfer_configured: boolean
  }
  gemini: {
    ready: boolean
    model: string
    voice_name: string
    language_code: string
  }
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}

function mapOrder(order: BackendOrder) {
  return {
    id: String(order.id),
    folio: order.folio,
    customerName: order.customer_name,
    phoneNumber: order.phone_number,
    type: order.type,
    items: order.items.map((item) => ({
      id: String(item.id),
      name: item.name_snapshot,
      quantity: item.quantity,
      price: toNumber(item.price),
      lineTotal: toNumber(item.line_total),
      notes: item.notes ?? undefined,
      modifiers: item.modifiers?.map((modifier) => modifier.name_snapshot) ?? [],
    })),
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.delivery_fee),
    total: toNumber(order.total),
    status: order.status,
    createdAt: order.created_at,
    deliveryAddress: order.delivery_address ?? undefined,
    notes: order.notes ?? undefined,
    paymentMethod: order.payment_method,
    aiCallSummary: order.ai_call_summary ?? undefined,
    transcript: order.transcript_preview ?? undefined,
    statusHistory: order.status_history.map((change) => ({
      status: change.status,
      timestamp: change.created_at,
      by: change.changed_by_label ?? undefined,
    })),
  }
}

function mapCall(call: BackendCall) {
  return {
    id: String(call.id),
    phoneNumber: call.phone_number,
    startTime: call.start_time,
    endTime: call.end_time ?? undefined,
    duration: call.duration_seconds ?? 0,
    status: call.status,
    resultedInOrder: call.resulted_in_order,
    orderId: call.order_id ? String(call.order_id) : undefined,
    transcript: call.transcript ?? undefined,
    aiSummary: call.ai_summary ?? undefined,
    errorFlags: call.error_flags?.map((flag) => flag.flag) ?? [],
    confidence: toNumber(call.confidence),
    toolCalls: call.tool_calls?.map((tool) => tool.tool_name) ?? [],
    sessionState: call.session_state ?? "ended",
    transferRequested: call.transfer_requested ?? false,
    draftCart: call.draft_cart
      ? {
          revision: call.draft_cart.revision ?? 0,
          items: (call.draft_cart.items ?? []).map((item) => ({
            lineId: item.line_id,
            productId: String(item.product_id),
            name: item.name,
            quantity: item.quantity,
            unitPrice: toNumber(item.unit_price),
            lineTotal: toNumber(item.line_total),
            modifiers: (item.modifiers ?? []).map((modifier) => ({
              id: String(modifier.id),
              name: modifier.name,
              price: toNumber(modifier.price),
            })),
          })),
          quote: call.draft_cart.quote
            ? {
                subtotal: toNumber(call.draft_cart.quote.subtotal),
                deliveryFee: toNumber(call.draft_cart.quote.delivery_fee),
                total: toNumber(call.draft_cart.quote.total),
                orderType: call.draft_cart.quote.order_type,
                paymentMethod: call.draft_cart.quote.payment_method,
              }
            : undefined,
        }
      : undefined,
  }
}

function mapCategory(category: BackendCategory) {
  return {
    id: String(category.id),
    name: category.name,
    description: category.description ?? undefined,
    productCount: category.product_count,
  }
}

function mapProduct(
  product: BackendProduct,
  categoryMap: Record<string, string>
) {
  return {
    id: String(product.id),
    name: product.name,
    description: product.description ?? "",
    category: product.category_id ? categoryMap[String(product.category_id)] ?? "Sin categoría" : "Sin categoría",
    categoryId: product.category_id ? String(product.category_id) : undefined,
    price: toNumber(product.price),
    isActive: product.is_active,
    isSoldOut: product.is_sold_out,
    imageUrl: product.image_url ?? undefined,
    modifiers: product.modifiers?.map((modifier) => ({
      id: String(modifier.id),
      name: modifier.name,
      price: toNumber(modifier.price),
    })) ?? [],
  }
}

function mapBotConfig(config: BackendBotConfig) {
  return {
    welcomeMessage: config.welcome_message ?? "",
    afterHoursMessage: config.after_hours_message ?? "",
    fallbackMessage: config.fallback_message ?? "",
    confirmationRequired: config.confirmation_required,
    retryCount: config.retry_count,
    unavailableBehavior: config.unavailable_behavior,
    canSuggestAlternatives: config.can_suggest_alternatives,
    tone: config.tone,
    specialInstructions: config.special_instructions ?? "",
  }
}

function getStoredValue(key: string) {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(key) ?? localStorage.getItem(key)
}

function getStorageArea(rememberMe: boolean) {
  return rememberMe ? localStorage : sessionStorage
}

function clearStorageArea(storage: Storage) {
  storage.removeItem(STORAGE_KEYS.token)
  storage.removeItem(STORAGE_KEYS.user)
  storage.removeItem(STORAGE_KEYS.businessId)
  storage.removeItem(STORAGE_KEYS.businesses)
}

export async function loginRequest(email: string, password: string) {
  return apiFetch<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export async function registerRequest(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  businessName?: string,
  acceptedTerms?: boolean
) {
  return apiFetch<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      business_name: businessName,
      accepted_terms: acceptedTerms,
    }),
  })
}

export async function meRequest() {
  return apiFetch("/api/v1/auth/me", {
    method: "GET",
    auth: true,
  })
}

export function persistSession(
  payload: LoginResponse["data"] | RegisterResponse["data"],
  options?: { rememberMe?: boolean }
) {
  if (typeof window === "undefined") return

  const rememberMe = options?.rememberMe ?? true
  const storage = getStorageArea(rememberMe)

  clearSession()

  storage.setItem(STORAGE_KEYS.token, payload.access_token)
  storage.setItem(STORAGE_KEYS.user, JSON.stringify(payload.user))
  storage.setItem(STORAGE_KEYS.businesses, JSON.stringify(payload.businesses ?? []))

  if (payload.businesses?.length) {
    storage.setItem(
      STORAGE_KEYS.businessId,
      String(payload.businesses[0].id)
    )
  }
}

export function getStoredUser() {
  const rawUser = getStoredValue(STORAGE_KEYS.user)
  if (!rawUser) return null

  try {
    return JSON.parse(rawUser)
  } catch {
    return null
  }
}

export function getStoredBusinesses() {
  const rawBusinesses = getStoredValue(STORAGE_KEYS.businesses)
  if (!rawBusinesses) return []

  try {
    return JSON.parse(rawBusinesses)
  } catch {
    return []
  }
}

export function getStoredToken() {
  return getStoredValue(STORAGE_KEYS.token)
}

export function clearSession() {
  if (typeof window === "undefined") return

  clearStorageArea(localStorage)
  clearStorageArea(sessionStorage)
}

export async function listOrders(params?: { status?: string; phoneNumber?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.status && params.status !== "all") searchParams.set("status", params.status)
  if (params?.phoneNumber) searchParams.set("phone_number", params.phoneNumber)

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await apiFetch<{ data: BackendOrder[] }>(`/api/v1/orders${suffix}`, {
    method: "GET",
    auth: true,
  })

  return response.data.map(mapOrder)
}

export async function listCustomers() {
  const response = await apiFetch<{ data: BackendCustomer[] }>("/api/v1/customers", {
    method: "GET",
    auth: true,
  })

  return response.data.map((customer) => ({
    id: String(customer.id),
    customerName: customer.customer_name,
    phoneNumber: customer.phone_number,
    totalOrders: customer.total_orders,
    totalCalls: customer.total_calls,
    totalSpent: toNumber(customer.total_spent),
    averageOrderValue: toNumber(customer.average_order_value),
    lastActivityDate: customer.last_activity_at ?? undefined,
    mostOrderedItems: customer.most_ordered_items ?? [],
    addresses: customer.addresses ?? [],
    orderHistory: (customer.order_history ?? []).map(mapOrder),
  }))
}

export async function updateOrderStatus(orderId: string, status: string) {
  const response = await apiFetch<{ data: BackendOrder }>(`/api/v1/orders/${orderId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ status }),
  })

  return mapOrder(response.data)
}

export async function listCalls(params?: { status?: string; phoneNumber?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.status && params.status !== "all") searchParams.set("status", params.status)
  if (params?.phoneNumber) searchParams.set("phone_number", params.phoneNumber)

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await apiFetch<{ data: BackendCall[] }>(`/api/v1/calls${suffix}`, {
    method: "GET",
    auth: true,
  })

  return response.data.map(mapCall)
}

export async function getVoiceRuntime() {
  const response = await apiFetch<{ data: { runtime: VoiceRuntimeStatus } }>("/api/v1/voice/runtime", {
    method: "GET",
    auth: true,
  })

  return response.data.runtime
}

export async function listCategories() {
  const response = await apiFetch<{ data: BackendCategory[] }>("/api/v1/menu/categories", {
    method: "GET",
    auth: true,
  })

  return response.data.map(mapCategory)
}

export async function createCategory(payload: {
  name: string
  description?: string
}) {
  const response = await apiFetch<{ data: BackendCategory }>("/api/v1/menu/categories", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
    }),
  })

  return mapCategory(response.data)
}

export async function listProducts() {
  const [categoriesResponse, productsResponse] = await Promise.all([
    apiFetch<{ data: BackendCategory[] }>("/api/v1/menu/categories", {
      method: "GET",
      auth: true,
    }),
    apiFetch<{ data: BackendProduct[] }>("/api/v1/menu/products?include_inactive=true", {
      method: "GET",
      auth: true,
    }),
  ])

  const categoryMap = Object.fromEntries(
    categoriesResponse.data.map((category) => [String(category.id), category.name])
  )

  return {
    categories: categoriesResponse.data.map(mapCategory),
    products: productsResponse.data.map((product) => mapProduct(product, categoryMap)),
  }
}

export async function createProduct(payload: {
  name: string
  description?: string
  categoryId?: string
  price: number
  isActive: boolean
  isSoldOut: boolean
  modifiers?: Array<{ name: string; price: number }>
}) {
  await apiFetch("/api/v1/menu/products", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      category_id: payload.categoryId ? Number(payload.categoryId) : null,
      price: payload.price,
      is_active: payload.isActive,
      is_sold_out: payload.isSoldOut,
      modifiers: payload.modifiers,
    }),
  })
}

export async function updateProduct(productId: string, payload: {
  name: string
  description?: string
  categoryId?: string
  price: number
  isActive: boolean
  isSoldOut: boolean
  modifiers?: Array<{ name: string; price: number }>
}) {
  const body = {
    name: payload.name,
    description: payload.description,
    category_id: payload.categoryId ? Number(payload.categoryId) : null,
    price: payload.price,
    is_active: payload.isActive,
    is_sold_out: payload.isSoldOut,
    ...(payload.modifiers ? { modifiers: payload.modifiers } : {}),
  }

  await apiFetch(`/api/v1/menu/products/${productId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(body),
  })
}

export async function deleteProduct(productId: string) {
  await apiFetch(`/api/v1/menu/products/${productId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function getCurrentBusiness() {
  const response = await apiFetch<{ data: BackendBusiness }>("/api/v1/businesses/current", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function updateCurrentBusiness(payload: Partial<BackendBusiness>) {
  const response = await apiFetch<{ data: BackendBusiness }>("/api/v1/businesses/current", {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function getBusinessSettings() {
  const response = await apiFetch<{ data: BackendBusinessSetting }>("/api/v1/businesses/current/settings", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function updateBusinessSettings(payload: Partial<BackendBusinessSetting>) {
  const response = await apiFetch<{ data: BackendBusinessSetting }>("/api/v1/businesses/current/settings", {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function listBusinessHours() {
  const response = await apiFetch<{ data: BackendBusinessHour[] }>("/api/v1/businesses/current/hours", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function replaceBusinessHours(hours: BackendBusinessHour[]) {
  await apiFetch("/api/v1/businesses/current/hours", {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ hours }),
  })
}

export async function listDeliveryZones() {
  const response = await apiFetch<{ data: Array<{ id: number; name: string }> }>("/api/v1/businesses/current/delivery-zones", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createDeliveryZone(name: string) {
  const response = await apiFetch<{ data: { id: number; name: string } }>("/api/v1/businesses/current/delivery-zones", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ name }),
  })

  return response.data
}

export async function deleteDeliveryZone(zoneId: string | number) {
  await apiFetch(`/api/v1/businesses/current/delivery-zones/${zoneId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function listPromotions() {
  const response = await apiFetch<{ data: Array<{ id: number; text: string }> }>("/api/v1/businesses/current/promotions", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createPromotion(text: string) {
  const response = await apiFetch<{ data: { id: number; text: string } }>("/api/v1/businesses/current/promotions", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ text }),
  })

  return response.data
}

export async function deletePromotion(promotionId: string | number) {
  await apiFetch(`/api/v1/businesses/current/promotions/${promotionId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function listPolicies() {
  const response = await apiFetch<{ data: Array<{ id: number; text: string }> }>("/api/v1/businesses/current/policies", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createPolicy(text: string) {
  const response = await apiFetch<{ data: { id: number; text: string } }>("/api/v1/businesses/current/policies", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ text }),
  })

  return response.data
}

export async function deletePolicy(policyId: string | number) {
  await apiFetch(`/api/v1/businesses/current/policies/${policyId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function listFaqs() {
  const response = await apiFetch<{ data: BackendFAQ[] }>("/api/v1/businesses/current/faqs", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createFaq(payload: {
  question: string
  answer: string
  category?: string
}) {
  const response = await apiFetch<{ data: BackendFAQ }>("/api/v1/businesses/current/faqs", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function updateFaq(faqId: string | number, payload: Partial<BackendFAQ>) {
  const response = await apiFetch<{ data: BackendFAQ }>(`/api/v1/businesses/current/faqs/${faqId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function deleteFaq(faqId: string | number) {
  await apiFetch(`/api/v1/businesses/current/faqs/${faqId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function getBotConfig() {
  const response = await apiFetch<{ data: BackendBotConfig }>("/api/v1/businesses/current/bot-config", {
    method: "GET",
    auth: true,
  })

  return mapBotConfig(response.data)
}

export async function updateBotConfig(payload: {
  welcomeMessage: string
  afterHoursMessage: string
  fallbackMessage: string
  confirmationRequired: boolean
  retryCount: number
  unavailableBehavior: "skip" | "suggest_alternative" | "ask_customer"
  canSuggestAlternatives: boolean
  tone: "formal" | "friendly" | "casual"
  specialInstructions: string
}) {
  const response = await apiFetch<{ data: BackendBotConfig }>("/api/v1/businesses/current/bot-config", {
    method: "PUT",
    auth: true,
    body: JSON.stringify({
      welcome_message: payload.welcomeMessage,
      after_hours_message: payload.afterHoursMessage,
      fallback_message: payload.fallbackMessage,
      confirmation_required: payload.confirmationRequired,
      retry_count: payload.retryCount,
      unavailable_behavior: payload.unavailableBehavior,
      can_suggest_alternatives: payload.canSuggestAlternatives,
      tone: payload.tone,
      special_instructions: payload.specialInstructions,
    }),
  })

  return mapBotConfig(response.data)
}

export async function listMenuRules() {
  const response = await apiFetch<{ data: BackendMenuRule[] }>("/api/v1/menu/rules", {
    method: "GET",
    auth: true,
  })

  return response.data.map((rule) => ({
    id: String(rule.id),
    name: rule.name,
    type: rule.type,
    description: rule.description ?? "",
    isActive: rule.is_active,
    config: rule.config,
  }))
}

export async function updateMenuRule(ruleId: string | number, payload: {
  name?: string
  type?: BackendMenuRule["type"]
  description?: string
  isActive?: boolean
  config?: Record<string, unknown>
}) {
  const response = await apiFetch<{ data: BackendMenuRule }>(`/api/v1/menu/rules/${ruleId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify({
      name: payload.name,
      type: payload.type,
      description: payload.description,
      is_active: payload.isActive,
      config: payload.config,
    }),
  })

  return {
    id: String(response.data.id),
    name: response.data.name,
    type: response.data.type,
    description: response.data.description ?? "",
    isActive: response.data.is_active,
    config: response.data.config,
  }
}
