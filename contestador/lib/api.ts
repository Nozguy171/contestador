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

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
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
  if (rest.body && !(rest.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json")
  }

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

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
    })
  } catch {
    throw new ApiError(
      "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
    )
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && auth && typeof window !== "undefined") {
      clearSession()
      if (window.location.pathname !== "/login") {
        window.location.assign("/login")
      }
    }
    const message =
      response.status >= 500
        ? "El servidor tuvo un problema. Nada se guardó; inténtalo de nuevo."
        : data?.message || "No pudimos completar la operación."
    throw new ApiError(message, response.status, data?.details)
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
  discount?: string | number
  promotion_id?: number | null
  promotion_name_snapshot?: string | null
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
  cash_change_for?: string | number | null
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
  source?: "voice" | "pos" | "kiosk"
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
  tool_calls: Array<{ tool_name: string; payload?: unknown }>
  session_state: "connecting" | "active" | "order_submitted" | "transferring" | "transferred" | "ended"
  transfer_requested: boolean
  gemini_model?: string | null
  voice_metrics?: Record<string, unknown>
  draft_cart?: {
    revision?: number
    unavailable_items?: string[]
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
      discount?: string | number
      promotion_name?: string | null
      delivery_fee: string | number
      total: string | number
      order_type: "pickup" | "delivery"
      payment_method: "cash" | "card" | "online"
      cash_change_for?: string | number | null
      change_due?: string | number | null
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
  aliases?: string[]
  modifiers?: Array<{
    id: number
    name: string
    price: string | number
    group_name?: string
    action?: "choice" | "add" | "remove"
    is_required?: boolean
  }>
  ingredients?: Array<{
    id: number
    inventory_item_id: number
    inventory_item_name: string
    unit: string
    quantity: string | number
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
  country_code?: string | null
  state_code?: string | null
  state_name?: string | null
  municipality_code?: string | null
  municipality_name?: string | null
  locality_code?: string | null
  locality_name?: string | null
  geo_catalog_version_id?: number | null
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
  voice_enabled: boolean
  voice_name: string
  insights_enabled: boolean
  timezone: string
  voice_address_mode: "off" | "shadow" | "candidate" | "enforce"
  voice_menu_v2_enabled: boolean
}

export type AddressCatalogVersion = {
  id: number
  source: string
  edition: string
  entity_code: string
  entity_name?: string | null
  municipality_code: string
  municipality_name?: string | null
  checksum_sha256: string
  imported_at: string
}

export type AddressLocality = { code: string; name: string }
export type AddressSettlement = { key: string; name: string; type?: string | null }
export type DeliveryZone = {
  id: number
  name: string
  settlement_names: string[]
  settlement_keys: string[]
  is_active: boolean
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

type BackendInventoryItem = {
  id: number
  name: string
  unit: string
  quantity: string | number
  minimum_quantity: string | number
  cost_per_unit: string | number
  category_id?: number | null
  category?: BackendInventoryCategory | null
  image_url?: string | null
  low_stock_alert_enabled: boolean
  is_low_stock: boolean
  is_active: boolean
}

type BackendInventoryCategory = {
  id: number
  name: string
  color: string
  item_count?: number
}

type BackendInventoryMovement = {
  id: number
  inventory_item_id: number
  item_name: string
  unit: string
  movement_type: "initial" | "purchase" | "sale" | "waste" | "correction" | "reversal"
  quantity_delta: string | number
  quantity_after: string | number
  reason?: string | null
  order_folio?: string | null
  changed_by_label?: string | null
  created_at: string
}

export type VoiceRuntimeStatus = {
  ready: boolean
  voice_enabled: boolean
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
    discount: toNumber(order.discount),
    promotionId: order.promotion_id ? String(order.promotion_id) : undefined,
    promotionName: order.promotion_name_snapshot ?? undefined,
    deliveryFee: toNumber(order.delivery_fee),
    total: toNumber(order.total),
    status: order.status,
    createdAt: order.created_at,
    deliveryAddress: order.delivery_address ?? undefined,
    notes: order.notes ?? undefined,
    paymentMethod: order.payment_method,
    cashChangeFor: order.cash_change_for == null ? undefined : toNumber(order.cash_change_for),
    changeDue: order.cash_change_for == null ? undefined : Math.max(0, toNumber(order.cash_change_for) - toNumber(order.total)),
    aiCallSummary: order.ai_call_summary ?? undefined,
    transcript: order.transcript_preview ?? undefined,
    statusHistory: order.status_history.map((change) => ({
      status: change.status,
      timestamp: change.created_at,
      by: change.changed_by_label ?? undefined,
    })),
    source: order.source ?? "voice",
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
    confidence: call.confidence == null ? null : toNumber(call.confidence),
    toolCalls: call.tool_calls?.map((tool) => tool.tool_name) ?? [],
    sessionState: call.session_state ?? "ended",
    transferRequested: call.transfer_requested ?? false,
    voiceDiagnostics: {
      model: call.gemini_model ?? undefined,
      metrics: call.voice_metrics ?? {},
    },
    draftCart: call.draft_cart
      ? {
          revision: call.draft_cart.revision ?? 0,
          unavailableItems: call.draft_cart.unavailable_items ?? [],
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
                discount: toNumber(call.draft_cart.quote.discount),
                promotionName: call.draft_cart.quote.promotion_name ?? undefined,
                deliveryFee: toNumber(call.draft_cart.quote.delivery_fee),
                total: toNumber(call.draft_cart.quote.total),
                orderType: call.draft_cart.quote.order_type,
                paymentMethod: call.draft_cart.quote.payment_method,
                cashChangeFor: call.draft_cart.quote.cash_change_for == null ? undefined : toNumber(call.draft_cart.quote.cash_change_for),
                changeDue: call.draft_cart.quote.change_due == null ? undefined : toNumber(call.draft_cart.quote.change_due),
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
    aliases: product.aliases ?? [],
    imageUrl: product.image_url ?? undefined,
    modifiers: product.modifiers?.map((modifier) => ({
      id: String(modifier.id),
      name: modifier.name,
      price: toNumber(modifier.price),
      groupName: modifier.group_name ?? "Personalización",
      action: modifier.action ?? "choice",
      isRequired: modifier.is_required ?? false,
    })) ?? [],
    ingredients: product.ingredients?.map((ingredient) => ({
      id: String(ingredient.id),
      inventoryItemId: String(ingredient.inventory_item_id),
      inventoryItemName: ingredient.inventory_item_name,
      unit: ingredient.unit,
      quantity: toNumber(ingredient.quantity),
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

function mapInventoryItem(item: BackendInventoryItem) {
  return {
    id: String(item.id),
    name: item.name,
    unit: item.unit,
    quantity: toNumber(item.quantity),
    minimumQuantity: toNumber(item.minimum_quantity),
    costPerUnit: toNumber(item.cost_per_unit),
    categoryId: item.category_id ? String(item.category_id) : undefined,
    category: item.category
      ? {
          id: String(item.category.id),
          name: item.category.name,
          color: item.category.color,
          itemCount: item.category.item_count ?? 0,
        }
      : undefined,
    imageUrl: item.image_url ?? undefined,
    lowStockAlertEnabled: item.low_stock_alert_enabled,
    isLowStock: item.is_low_stock,
    isActive: item.is_active,
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

export function canReviewVoiceEvents() {
  const businessId = getStoredValue(STORAGE_KEYS.businessId)
  const business = getStoredBusinesses().find((item: { id?: number | string }) => String(item.id) === String(businessId)) as
    | { role?: string }
    | undefined
  return ["owner", "admin", "manager"].includes(business?.role ?? "")
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

export async function createManualOrder(payload: {
  customerName?: string
  phoneNumber?: string
  type: "pickup" | "delivery"
  paymentMethod: "cash" | "card" | "online"
  cashChangeFor?: number
  deliveryAddress?: string
  notes?: string
  source?: "pos" | "kiosk"
  items: Array<{
    productId: string
    quantity: number
    modifierIds: string[]
    notes?: string
  }>
}) {
  const response = await apiFetch<{ data: BackendOrder }>("/api/v1/orders", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      customer_name: payload.customerName,
      phone_number: payload.phoneNumber,
      type: payload.type,
      payment_method: payload.paymentMethod,
      cash_change_for: payload.cashChangeFor,
      delivery_address: payload.deliveryAddress,
      notes: payload.notes,
      source: payload.source ?? "pos",
      items: payload.items.map((item) => ({
        product_id: Number(item.productId),
        quantity: item.quantity,
        modifier_ids: item.modifierIds.map(Number),
        notes: item.notes,
      })),
    }),
  })
  return mapOrder(response.data)
}

export async function quoteManualOrder(payload: {
  customerName?: string
  type: "pickup" | "delivery"
  paymentMethod: "cash" | "card" | "online"
  cashChangeFor?: number
  deliveryAddress?: string
  notes?: string
  items: Array<{
    productId: string
    quantity: number
    modifierIds: string[]
    notes?: string
  }>
}) {
  const response = await apiFetch<{
    data: {
      subtotal: string | number
      discount: string | number
      promotion_id?: number | null
      promotion_name?: string | null
      delivery_fee: string | number
      total: string | number
    }
  }>("/api/v1/orders/quote", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      customer_name: payload.customerName,
      type: payload.type,
      payment_method: payload.paymentMethod,
      cash_change_for: payload.cashChangeFor,
      delivery_address: payload.deliveryAddress,
      notes: payload.notes,
      items: payload.items.map((item) => ({
        product_id: Number(item.productId),
        quantity: item.quantity,
        modifier_ids: item.modifierIds.map(Number),
        notes: item.notes,
      })),
    }),
  })
  return {
    subtotal: toNumber(response.data.subtotal),
    discount: toNumber(response.data.discount),
    promotionId: response.data.promotion_id ? String(response.data.promotion_id) : undefined,
    promotionName: response.data.promotion_name ?? undefined,
    deliveryFee: toNumber(response.data.delivery_fee),
    total: toNumber(response.data.total),
  }
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

export async function listCallPage(params?: {
  status?: string
  phoneNumber?: string
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.status && params.status !== "all") searchParams.set("status", params.status)
  if (params?.phoneNumber) searchParams.set("phone_number", params.phoneNumber)
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit))
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset))

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const response = await apiFetch<{ data: { items: BackendCall[]; total: number } }>(`/api/v1/calls${suffix}`, {
    method: "GET",
    auth: true,
  })

  return { items: response.data.items.map(mapCall), total: response.data.total }
}

export async function listCalls(params?: { status?: string; phoneNumber?: string }) {
  return (await listCallPage(params)).items
}

export async function getVoiceCallEvents(callId: string) {
  const response = await apiFetch<{
    data: {
      model?: string | null
      metrics: Record<string, unknown>
      transcript_events: import("./types").CallVoiceEvent[]
      total_events: number
      truncated: boolean
    }
  }>("/api/v1/calls/" + callId + "/voice-events", {
    method: "GET",
    auth: true,
  })
  return response.data
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
  aliases?: string[]
  imageUrl?: string
  ingredients?: Array<{ inventoryItemId: string; quantity: number }>
  modifiers?: Array<{
    name: string
    price: number
    groupName: string
    action: "choice" | "add" | "remove"
    isRequired?: boolean
  }>
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
      aliases: payload.aliases,
      image_url: payload.imageUrl,
      ingredients: payload.ingredients?.map((ingredient) => ({
        inventory_item_id: Number(ingredient.inventoryItemId),
        quantity: ingredient.quantity,
      })),
      modifiers: payload.modifiers?.map((modifier) => ({
        name: modifier.name,
        price: modifier.price,
        group_name: modifier.groupName,
        action: modifier.action,
        is_required: modifier.isRequired,
      })),
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
  aliases?: string[]
  imageUrl?: string
  ingredients?: Array<{ inventoryItemId: string; quantity: number }>
  modifiers?: Array<{
    name: string
    price: number
    groupName: string
    action: "choice" | "add" | "remove"
    isRequired?: boolean
  }>
}) {
  const body = {
    name: payload.name,
    description: payload.description,
    category_id: payload.categoryId ? Number(payload.categoryId) : null,
    price: payload.price,
    is_active: payload.isActive,
    is_sold_out: payload.isSoldOut,
    image_url: payload.imageUrl,
    aliases: payload.aliases,
    ...(payload.ingredients
      ? {
          ingredients: payload.ingredients.map((ingredient) => ({
            inventory_item_id: Number(ingredient.inventoryItemId),
            quantity: ingredient.quantity,
          })),
        }
      : {}),
        ...(payload.modifiers
          ? {
            modifiers: payload.modifiers.map((modifier) => ({
              name: modifier.name,
              price: modifier.price,
              group_name: modifier.groupName,
              action: modifier.action,
              is_required: modifier.isRequired,
            })),
          }
      : {}),
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

export async function listInventory() {
  const response = await apiFetch<{ data: BackendInventoryItem[] }>("/api/v1/inventory", {
    method: "GET",
    auth: true,
  })
  return response.data.map(mapInventoryItem)
}

export async function createInventoryItem(payload: {
  name: string
  unit: string
  quantity: number
  minimumQuantity: number
  costPerUnit: number
  categoryId?: string
  imageUrl?: string
  lowStockAlertEnabled: boolean
}) {
  const response = await apiFetch<{ data: BackendInventoryItem }>("/api/v1/inventory", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      name: payload.name,
      unit: payload.unit,
      quantity: payload.quantity,
      minimum_quantity: payload.minimumQuantity,
      cost_per_unit: payload.costPerUnit,
      category_id: payload.categoryId ? Number(payload.categoryId) : null,
      image_url: payload.imageUrl,
      low_stock_alert_enabled: payload.lowStockAlertEnabled,
    }),
  })
  return mapInventoryItem(response.data)
}

export async function updateInventoryItem(
  itemId: string,
  payload: Partial<{
    name: string
    unit: string
    quantity: number
    minimumQuantity: number
    costPerUnit: number
    categoryId?: string
    imageUrl?: string
    lowStockAlertEnabled: boolean
    isActive: boolean
  }>
) {
  const response = await apiFetch<{ data: BackendInventoryItem }>(`/api/v1/inventory/${itemId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
      ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
      ...(payload.minimumQuantity !== undefined
        ? { minimum_quantity: payload.minimumQuantity }
        : {}),
      ...(payload.costPerUnit !== undefined ? { cost_per_unit: payload.costPerUnit } : {}),
      ...(payload.categoryId !== undefined
        ? { category_id: payload.categoryId ? Number(payload.categoryId) : null }
        : {}),
      ...(payload.imageUrl !== undefined ? { image_url: payload.imageUrl } : {}),
      ...(payload.lowStockAlertEnabled !== undefined
        ? { low_stock_alert_enabled: payload.lowStockAlertEnabled }
        : {}),
      ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
    }),
  })
  return mapInventoryItem(response.data)
}

export async function adjustInventoryItem(
  itemId: string,
  payload: {
    delta: number
    movementType: "purchase" | "waste" | "correction"
    reason?: string
  }
) {
  const response = await apiFetch<{ data: BackendInventoryItem }>(
    `/api/v1/inventory/${itemId}/adjust`,
    {
      method: "POST",
      auth: true,
      body: JSON.stringify({
        delta: payload.delta,
        movement_type: payload.movementType,
        reason: payload.reason,
      }),
    }
  )
  return mapInventoryItem(response.data)
}

export async function listInventoryCategories() {
  const response = await apiFetch<{ data: BackendInventoryCategory[] }>(
    "/api/v1/inventory/categories",
    { method: "GET", auth: true }
  )
  return response.data.map((category) => ({
    id: String(category.id),
    name: category.name,
    color: category.color,
    itemCount: category.item_count ?? 0,
  }))
}

export async function createInventoryCategory(payload: { name: string; color: string }) {
  const response = await apiFetch<{ data: BackendInventoryCategory }>(
    "/api/v1/inventory/categories",
    {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    }
  )
  return {
    id: String(response.data.id),
    name: response.data.name,
    color: response.data.color,
    itemCount: 0,
  }
}

export async function listInventoryMovements(itemId?: string) {
  const suffix = itemId ? `?item_id=${encodeURIComponent(itemId)}` : ""
  const response = await apiFetch<{ data: BackendInventoryMovement[] }>(
    `/api/v1/inventory/movements${suffix}`,
    { method: "GET", auth: true }
  )
  return response.data.map((movement) => ({
    id: String(movement.id),
    inventoryItemId: String(movement.inventory_item_id),
    itemName: movement.item_name,
    unit: movement.unit,
    movementType: movement.movement_type,
    quantityDelta: toNumber(movement.quantity_delta),
    quantityAfter: toNumber(movement.quantity_after),
    reason: movement.reason ?? undefined,
    orderFolio: movement.order_folio ?? undefined,
    changedByLabel: movement.changed_by_label ?? undefined,
    createdAt: movement.created_at,
  }))
}

export async function uploadImage(file: File) {
  const formData = new FormData()
  formData.append("image", file)
  const response = await apiFetch<{ data: { url: string } }>("/api/v1/uploads/images", {
    method: "POST",
    auth: true,
    body: formData,
  })
  return response.data.url
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

export async function listAddressCatalogs() {
  const response = await apiFetch<{ data: AddressCatalogVersion[] }>(
    "/api/v1/businesses/current/address-catalogs",
    { method: "GET", auth: true }
  )
  return response.data
}

export async function listAddressCatalogLocalities(versionId: string | number) {
  const response = await apiFetch<{ data: AddressLocality[] }>(
    `/api/v1/businesses/current/address-catalogs/${versionId}/localities`,
    { method: "GET", auth: true }
  )
  return response.data
}

export async function listAddressCatalogSettlements(versionId: string | number, localityCode: string) {
  const params = new URLSearchParams({ locality_code: localityCode })
  const response = await apiFetch<{ data: AddressSettlement[] }>(
    `/api/v1/businesses/current/address-catalogs/${versionId}/settlements?${params}`,
    { method: "GET", auth: true }
  )
  return response.data
}

export async function updateBusinessLocation(payload: {
  geo_catalog_version_id: number | null
  locality_code?: string | null
}) {
  const response = await apiFetch<{ data: Pick<BackendBusiness,
    | "country_code"
    | "state_code"
    | "state_name"
    | "municipality_code"
    | "municipality_name"
    | "locality_code"
    | "locality_name"
    | "geo_catalog_version_id"
  > }>("/api/v1/businesses/current/location", {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function getVoicePreview(voiceName: string) {
  const token = getStoredValue(STORAGE_KEYS.token)
  if (!token) throw new ApiError("Tu sesión expiró. Vuelve a iniciar sesión.", 401)

  const businessId = getStoredValue(STORAGE_KEYS.businessId) || await resolveBusinessIdFromProfile(token)
  const response = await fetch(`${API_BASE_URL}/api/v1/voice/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Business-Id": businessId,
    },
    body: JSON.stringify({ voice_name: voiceName }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.message || "No se pudo generar el preview de voz.", response.status)
  }

  return response.blob()
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
  const response = await apiFetch<{ data: DeliveryZone[] }>("/api/v1/businesses/current/delivery-zones", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createDeliveryZone(name: string) {
  const response = await apiFetch<{ data: DeliveryZone }>("/api/v1/businesses/current/delivery-zones", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ name }),
  })

  return response.data
}

export async function updateDeliveryZone(zoneId: string | number, payload: {
  settlement_names?: string[]
  settlement_keys?: string[]
  name?: string
  is_active?: boolean
}) {
  const response = await apiFetch<{ data: DeliveryZone }>(`/api/v1/businesses/current/delivery-zones/${zoneId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
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
  const response = await apiFetch<{ data: import("./types").Promotion[] }>("/api/v1/businesses/current/promotions", {
    method: "GET",
    auth: true,
  })

  return response.data
}

export async function createPromotion(payload: Omit<import("./types").Promotion, "id" | "status" | "customer_description">) {
  const response = await apiFetch<{ data: import("./types").Promotion }>("/api/v1/businesses/current/promotions", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  })

  return response.data
}

export async function updatePromotion(
  promotionId: string | number,
  payload: Partial<Omit<import("./types").Promotion, "id" | "status" | "customer_description">>
) {
  const response = await apiFetch<{ data: import("./types").Promotion }>(`/api/v1/businesses/current/promotions/${promotionId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  })
  return response.data
}

export async function deletePromotion(promotionId: string | number) {
  await apiFetch(`/api/v1/businesses/current/promotions/${promotionId}`, {
    method: "DELETE",
    auth: true,
  })
}

export async function getBusinessInsights() {
  const response = await apiFetch<{ data: import("./types").BusinessInsights }>("/api/v1/insights", {
    method: "GET",
    auth: true,
  })
  return response.data
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
