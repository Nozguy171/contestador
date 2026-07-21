from enum import Enum


class BusinessRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    AGENT = "agent"
    VIEWER = "viewer"


class UnavailableBehavior(str, Enum):
    SKIP = "skip"
    SUGGEST_ALTERNATIVE = "suggest_alternative"
    ASK_CUSTOMER = "ask_customer"


class BotTone(str, Enum):
    FORMAL = "formal"
    FRIENDLY = "friendly"
    CASUAL = "casual"


class MenuRuleType(str, Enum):
    TIME_RESTRICTION = "time_restriction"
    DELIVERY_RULE = "delivery_rule"
    COMBO_RULE = "combo_rule"
    MODIFIER_RULE = "modifier_rule"
    PAYMENT_RULE = "payment_rule"


class OrderType(str, Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"


class OrderStatus(str, Enum):
    NEW = "new"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY = "ready"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    ONLINE = "online"


class ChangedByType(str, Enum):
    SYSTEM = "system"
    USER = "user"
    BOT = "bot"


class CallStatus(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"
    DROPPED = "dropped"
    INCOMPLETE = "incomplete"
