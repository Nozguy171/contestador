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
}

export interface ProductModifier {
  id: string
  name: string
  price: number
}

export interface Category {
  id: string
  name: string
  description?: string
  productCount: number
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
