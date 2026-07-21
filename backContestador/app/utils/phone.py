def normalize_phone_number(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = value.strip()
    digits = "".join(char for char in cleaned if char.isdigit())
    if not digits:
        return cleaned or None
    return f"+{digits}" if cleaned.startswith("+") else digits
