export type OrderStatus = 
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"

export type OrderType = "pickup" | "delivery"

export type PaymentMethod = "cash" | "card" | "online"

export interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
  lineTotal?: number
  modifiers?: string[]
  notes?: string
}

export interface StatusChange {
  status: OrderStatus
  timestamp: string
  by?: string
}

export interface Order {
  id: string
  folio: string
  customerName: string
  phoneNumber: string
  type: OrderType
  items: OrderItem[]
  subtotal: number
  discount: number
  promotionId?: string
  promotionName?: string
  deliveryFee: number
  total: number
  status: OrderStatus
  createdAt: string
  deliveryAddress?: string
  notes?: string
  paymentMethod: PaymentMethod
  aiCallSummary?: string
  transcript?: string
  statusHistory: StatusChange[]
  source: "voice" | "pos" | "kiosk"
}

export interface DraftCartItem {
  lineId: string
  productId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  modifiers: Array<{ id: string; name: string; price: number }>
}

export interface DraftCart {
  revision: number
  items: DraftCartItem[]
  quote?: {
    subtotal: number
    discount: number
    promotionName?: string
    deliveryFee: number
    total: number
    orderType: OrderType
    paymentMethod: PaymentMethod
  }
}

export interface CallLog {
  id: string
  phoneNumber: string
  startTime: string
  duration: number
  status: "completed" | "failed" | "dropped" | "incomplete"
  resultedInOrder: boolean
  orderId?: string
  endTime?: string | null
  transcript?: string
  aiSummary?: string
  errorFlags?: string[]
  confidence: number
  toolCalls?: string[]
  sessionState: "connecting" | "active" | "order_submitted" | "transferring" | "transferred" | "ended"
  draftCart?: DraftCart
  transferRequested: boolean
}

export interface Product {
  id: string
  name: string
  description: string
  category: string
  categoryId?: string
  price: number
  isActive: boolean
  isSoldOut: boolean
  modifiers?: ProductModifier[]
  imageUrl?: string
  ingredients?: ProductIngredient[]
}

export interface ProductModifier {
  id: string
  name: string
  price: number
  groupName: string
  action: "choice" | "add" | "remove"
}

export interface ProductIngredient {
  id: string
  inventoryItemId: string
  inventoryItemName: string
  unit: string
  quantity: number
}

export interface Category {
  id: string
  name: string
  description?: string
  productCount: number
}

export type PromotionType = "percentage" | "two_for_one" | "second_half"
export type PromotionScope = "all" | "category" | "product"

export interface Promotion {
  id: number
  name: string
  text: string
  promotion_type: PromotionType
  value: number
  scope_type: PromotionScope
  product_id?: number | null
  category_id?: number | null
  days_of_week: number[]
  is_active: boolean
  starts_at?: string | null
  ends_at?: string | null
  status: "active" | "scheduled" | "expired" | "inactive"
  customer_description: string
}

export interface BusinessInsights {
  enabled: boolean
  data_window_days: number
  inventory_window_days?: number
  sample_size?: number
  generated_at?: string
  sales_by_weekday: Array<{
    day_index: number
    day: string
    total_orders: number
    total_revenue: number
    average_orders: number
    average_revenue: number
  }>
  purchase_suggestions: Array<{
    item_id: number
    name: string
    unit: string
    current_quantity: number
    consumed_28_days: number
    average_daily_use: number
    estimated_days_remaining?: number | null
    recommended_purchase: number
  }>
  recommendations: Array<{
    kind: "promotion" | "inventory" | "learning"
    title: string
    message: string
    confidence: "learning" | "medium" | "high"
    action_href: string
    suggested_day?: number
  }>
}

export interface PhoneCustomer {
  id: string
  customerName: string
  phoneNumber: string
  totalOrders: number
  totalCalls: number
  totalSpent: number
  averageOrderValue: number
  mostOrderedItems: string[]
  lastActivityDate?: string
  addresses: string[]
  orderHistory: Order[]
}

export interface BusinessInfo {
  name: string
  address: string
  phone: string
  email: string
  businessHours: {
    day: string
    open: string
    close: string
    isClosed: boolean
  }[]
  paymentMethods: PaymentMethod[]
  deliveryZones: string[]
  estimatedDeliveryTime: string
  promotions: string[]
  policies: string[]
}

export interface FAQ {
  id: string
  question: string
  answer: string
  category: string
}

export interface BotConfig {
  welcomeMessage: string
  afterHoursMessage: string
  fallbackMessage: string
  confirmationRequired: boolean
  retryCount: number
  unavailableBehavior: "skip" | "suggest_alternative" | "ask_customer"
  canSuggestAlternatives: boolean
  tone: "formal" | "friendly" | "casual"
  specialInstructions: string
}

export interface MenuRule {
  id: string
  name: string
  type: "time_restriction" | "delivery_rule" | "combo_rule" | "modifier_rule" | "payment_rule"
  description: string
  isActive: boolean
  config: Record<string, unknown>
}

export interface InventoryItem {
  id: string
  name: string
  unit: string
  quantity: number
  minimumQuantity: number
  costPerUnit: number
  categoryId?: string
  category?: InventoryCategory
  imageUrl?: string
  lowStockAlertEnabled: boolean
  isLowStock: boolean
  isActive: boolean
}

export interface InventoryCategory {
  id: string
  name: string
  color: string
  itemCount: number
}

export interface InventoryMovement {
  id: string
  inventoryItemId: string
  itemName: string
  unit: string
  movementType: "initial" | "purchase" | "sale" | "waste" | "correction" | "reversal"
  quantityDelta: number
  quantityAfter: number
  reason?: string
  orderFolio?: string
  changedByLabel?: string
  createdAt: string
}
