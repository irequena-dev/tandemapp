import re
from datetime import date, time, timedelta

# --- Parser tolerante de fecha/hora -----------------------------------------
# Los modelos on-device (Gemma-4-E4B-it) son malos formateando fechas a ISO y
# no saben qué año es (alucinan 2024). En vez de exigirles ISO, les pedimos que
# pasen la fecha/hora tal como la dictó el usuario y la interpretamos aquí.
# El año, si no viene, lo pone el reloj del servidor (no el modelo). (issue 05)


class DateParseError(ValueError):
    """Fecha/hora no reconocida. Es ValueError para que handle_call_tool la
    devuelva al modelo como error de herramienta con un mensaje claro."""


_SPANISH_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "set": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}


def _strip_accents(s: str) -> str:
    return (
        s.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )


def _resolve_year(raw_year: str | None, current_year: int) -> int:
    if raw_year is None:
        return current_year
    year = int(raw_year)
    return year + 2000 if year < 100 else year


def _safe_date(year: int, month: int, day: int, raw: str) -> date:
    try:
        return date(year, month, day)
    except ValueError as err:
        raise DateParseError(
            f"La fecha '{raw}' no es válida (día/mes/año fuera de rango). "
            "Dila en lenguaje natural, ej: '15 de julio de 2026'."
        ) from err


def parse_flexible_date(raw: str) -> date:
    """Acepta ISO (2026-07-15), DD/MM/YYYY, lenguaje natural ('15 de julio de
    2026', '15 julio') y relativos ('hoy', 'mañana', 'ayer'). Si falta el año,
    usa el año actual del servidor."""
    if not raw or not raw.strip():
        raise DateParseError("Fecha vacía.")
    s = _strip_accents(re.sub(r"\s+", " ", raw.strip().lower()))

    today = date.today()
    relatives = {
        "hoy": today,
        "manana": today + timedelta(days=1),
        "ayer": today - timedelta(days=1),
        "pasado manana": today + timedelta(days=2),
    }
    if s in relatives:
        return relatives[s]

    # Lenguaje natural: "15 de julio de 2026", "15 julio", "el 15 de julio"
    m = re.match(
        r"^(?:el\s+)?(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?\s*(?:de\s+(\d{2,4}))?$",
        s,
    )
    if m and m.group(2) in _SPANISH_MONTHS:
        return _safe_date(
            _resolve_year(m.group(3), today.year),
            _SPANISH_MONTHS[m.group(2)],
            int(m.group(1)),
            raw,
        )

    # Numérico: "15/07/2026", "15-7-26", "2026-07-15", "15.07.2026"
    m = re.match(r"^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$", s)
    if m:
        a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a >= 1000:  # YYYY-MM-DD
            year, month, day = a, b, c
        else:  # DD-MM-YYYY (formato europeo/español)
            day, month, year = a, b, c + 2000 if c < 100 else c
        return _safe_date(year, month, day, raw)

    raise DateParseError(
        f"No reconocí la fecha '{raw}'. Dila como el usuario: "
        "'15 de julio de 2026', 'mañana' o '15/07/2026'."
    )


def parse_flexible_time(raw: str) -> time:
    """Acepta '16:00', '16.30', '4 de la tarde', 'por la noche', 'a las 5'.
    Rescata entradas con basura tipo '16:000'."""
    if not raw or not raw.strip():
        raise DateParseError("Hora vacía.")
    s = _strip_accents(re.sub(r"\s+", " ", raw.strip().lower()))

    afternoon = "tarde" in s or "pm" in s
    night = "noche" in s
    morning = ("manana" in s or "am" in s) and not afternoon and not night

    nums = re.findall(r"\d+", s)
    if not nums:
        raise DateParseError(
            f"No reconocí la hora '{raw}'. Dila como 'a las 4' o '16:00'."
        )
    hours = int(nums[0])
    minutes = int(nums[1]) if len(nums) > 1 else 0
    if minutes >= 60:  # rescata '16:000' -> minutos 0
        minutes = 0
    if (afternoon or night) and hours < 12:
        hours += 12
    if morning and hours == 12:
        hours = 0
    if hours > 23:
        raise DateParseError(
            f"La hora '{raw}' no es válida. Dila como 'a las 4' o '16:00'."
        )
    return time(hours, minutes)
