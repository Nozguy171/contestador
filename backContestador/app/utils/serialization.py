from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum


def serialize_value(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value
