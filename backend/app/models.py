import datetime as _dt
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import sqlalchemy as sa
from pydantic import field_validator
from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel

# Aliases para evitar shadowing con nombres de columna en modelos SQLModel.
dt_time = _dt.time
dt_date = _dt.date

# Paleta acotada de colores de avatar para Hijo. Las claves corresponden a los
# tonos de identidad del sistema de diseño (data-tone 0–5 en el CSS).
AVATAR_COLORS: tuple[str, ...] = (
    "clay",
    "sage",
    "ochre",
    "terracotta",
    "olive",
    "rosewood",
)

AvatarColor = Literal["clay", "sage", "ochre", "terracotta", "olive", "rosewood"]


class Family(SQLModel, table=True):
    """Espejo de la Organización de Clerk; unidad de aislamiento (tenant).

    La PK es el `org_id` de Clerk: resuelve sin ambigüedad la Familia para RLS.
    """

    __tablename__ = "families"

    id: str = Field(primary_key=True)
    slug: str | None = None
    name: str | None = None


class Member(SQLModel, table=True):
    """Espejo del usuario de Clerk; pertenece a exactamente una Familia.

    La PK es el `user_id` de Clerk; `family_id` es el `org_id` de su Familia.
    """

    __tablename__ = "members"

    id: str = Field(primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    display_name: str | None = None


class ChildBase(SQLModel):
    """Datos de dominio de un Hijo que el Miembro dicta/edita en la PWA."""

    name: str
    birth_date: date
    avatar_color: str | None = None

    @field_validator("avatar_color")
    @classmethod
    def validate_avatar_color(cls, v: str | None) -> str | None:
        if v is not None and v not in AVATAR_COLORS:
            msg = f"avatar_color debe ser uno de {AVATAR_COLORS}"
            raise ValueError(msg)
        return v


class Child(ChildBase, table=True):
    """Hijo: persona menor sujeto de los datos de crianza dentro de una Familia.

    No es un usuario del sistema; tiene identidad propia y estable. La edad se
    deriva de `birth_date` en la PWA (no se persiste). `family_id` lo fija el
    backend desde el contexto autenticado; el cliente nunca lo envía.
    """

    __tablename__ = "children"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)


class ChildWithMetricsOut(SQLModel):
    """Hijo enriquecido con las métricas actuales (§1.3.1 del contrato API).

    Los valores se derivan de la Medida/Talla más reciente por tipo; `null`
    indica que no hay ningún registro de ese tipo para el Hijo.
    """

    id: uuid.UUID
    family_id: str
    name: str
    birth_date: date
    avatar_color: str | None = None
    current_height_cm: float | None = None
    current_weight_kg: float | None = None
    current_talla: str | None = None
    current_talla_calzado: str | None = None


class ChildCreate(ChildBase):
    """Cuerpo del alta de un Hijo (sin `family_id`: lo impone el servidor)."""


class ChildUpdate(SQLModel):
    """Edición parcial de un Hijo: solo los campos presentes se actualizan."""

    name: str | None = None
    birth_date: date | None = None
    avatar_color: str | None = None

    @field_validator("avatar_color")
    @classmethod
    def validate_avatar_color(cls, v: str | None) -> str | None:
        if v is not None and v not in AVATAR_COLORS:
            msg = f"avatar_color debe ser uno de {AVATAR_COLORS}"
            raise ValueError(msg)
        return v


class EventType(SQLModel, table=True):
    """Tipo de Evento: categoría para clasificar Eventos en la agenda.

    `family_id = NULL` → tipo base del sistema (compartido, `is_system=True`).
    `family_id` con valor → tipo personalizado de una Familia.
    """

    __tablename__ = "event_types"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str | None = Field(default=None, foreign_key="families.id")
    name: str
    icon: str = "circle"
    is_system: bool = False


class EventTypeOut(SQLModel):
    """Representación de lectura de un Tipo de Evento."""

    id: uuid.UUID
    family_id: str | None
    name: str
    icon: str
    is_system: bool


class EventTypeCreate(SQLModel):
    """Cuerpo del alta de un Tipo de Evento personalizado."""

    name: str
    icon: str = "circle"


class EventTypeUpdate(SQLModel):
    """Edición parcial de un Tipo de Evento personalizado."""

    name: str | None = None
    icon: str | None = None


# ---------- Eventos ----------

EventStatus = Literal["pending", "done"]


class Event(SQLModel, table=True):
    """Evento: algo que ocurre o vence en una fecha, perteneciente a la Familia.

    `time` nullable → día completo. `status` es solo manual (`done`/`pending`);
    `is_overdue` se calcula en lectura (no se persiste). `child_id` es 0 o 1 Hijo.
    `series_id` es nullable (solo relleno si fue generado por una Serie).
    """

    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    title: str
    date: date
    time: dt_time | None = None
    event_type_id: uuid.UUID = Field(foreign_key="event_types.id")
    child_id: uuid.UUID | None = Field(default=None, foreign_key="children.id")
    status: str = Field(default="pending")
    series_id: uuid.UUID | None = Field(default=None)
    created_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        )
    )


class EventCreate(SQLModel):
    """Cuerpo del alta de un Evento (sin family_id/created_by: servidor)."""

    title: str
    date: date
    time: dt_time | None = None
    event_type_id: uuid.UUID
    child_id: uuid.UUID | None = None


class EventUpdate(SQLModel):
    """Edición parcial de un Evento."""

    title: str | None = None
    date: dt_date | None = None
    time: dt_time | None = None
    event_type_id: uuid.UUID | None = None
    child_id: uuid.UUID | None = None


class ChildOut(SQLModel):
    """Hijo expandido inline en la respuesta de Evento."""

    id: uuid.UUID
    family_id: str
    name: str
    birth_date: date
    avatar_color: str | None = None


class EventOut(SQLModel):
    """Evento tal como lo devuelve la API, con tipo y Hijo expandidos."""

    id: uuid.UUID
    family_id: str
    title: str
    date: dt_date
    time: dt_time | None
    event_type_id: uuid.UUID
    event_type: EventTypeOut
    child_id: uuid.UUID | None
    child: ChildOut | None
    status: str
    is_overdue: bool
    series_id: uuid.UUID | None
    created_by: str
    created_at: datetime


class ShoppingItem(SQLModel, table=True):
    """Ítem de compra: algo que hay que comprar, en la lista única de la Familia.

    Estado `pending` (por comprar) o `bought` (comprado). `text` es texto libre
    (el Miembro dicta "pañales talla 4 para Lucía"). `created_by` registra quién
    lo apuntó; `family_id` acota por RLS.
    """

    __tablename__ = "shopping_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    text: str
    status: str = Field(default="pending")
    created_by: str = Field(foreign_key="members.id")
    bought_by: str | None = Field(default=None, foreign_key="members.id")
    bought_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )


class ShoppingItemCreate(SQLModel):
    """Cuerpo del alta de un Ítem de compra (texto libre, sin `family_id`)."""

    text: str


class ShoppingItemUpdate(SQLModel):
    """Edición parcial de un Ítem de compra: solo el texto libre."""

    text: str


class ShoppingItemOut(SQLModel):
    """Representación de un Ítem de compra para el frontend."""

    id: uuid.UUID
    family_id: str
    text: str
    status: str
    created_by: str
    bought_by: str | None
    bought_at: datetime | None
    created_at: datetime
    updated_at: datetime


class Measurement(SQLModel, table=True):
    """Medida numérica (altura/peso) de un Hijo, append-only.

    Cada registro conserva un valor con su fecha; el "valor actual" es el más
    reciente por tipo (derivado por consulta, no almacenado aparte).
    """

    __tablename__ = "measurements"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    child_id: uuid.UUID = Field(foreign_key="children.id", index=True)
    type: str  # 'height' | 'weight'
    value: float
    unit: str  # 'cm' | 'kg'
    measured_at: date
    recorded_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )


class MeasurementCreate(SQLModel):
    """Alta de una Medida (el servidor impone family_id y recorded_by)."""

    type: str  # 'height' | 'weight'
    value: float
    unit: str  # 'cm' | 'kg'
    measured_at: date


class MeasurementUpdate(SQLModel):
    """Corrección parcial de una Medida."""

    value: float | None = None
    unit: str | None = None
    measured_at: date | None = None


class MeasurementOut(SQLModel):
    """Medida tal y como la devuelve la API."""

    id: uuid.UUID
    child_id: uuid.UUID
    type: str
    value: float
    unit: str
    measured_at: date
    recorded_by: str
    created_at: datetime


class CurrentMeasurementsOut(SQLModel):
    """Valores más recientes por tipo (height / weight)."""

    height: MeasurementOut | None = None
    weight: MeasurementOut | None = None


# ---------- Tallas (sizes) ----------

SizeType = Literal["clothing", "footwear"]


class Size(SQLModel, table=True):
    """Talla de ropa o calzado de un Hijo; append-only, la actual es la más reciente."""

    __tablename__ = "sizes"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    child_id: uuid.UUID = Field(foreign_key="children.id", index=True)
    type: str = Field(sa_type=sa.Text)
    label: str
    recorded_at: date
    recorded_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )


class SizeCreate(SQLModel):
    """Alta de una Talla (sin family_id ni recorded_by: los impone el servidor)."""

    type: SizeType
    label: str
    recorded_at: date


class SizeUpdate(SQLModel):
    """Edición parcial de una Talla (corrección)."""

    label: str | None = None
    recorded_at: date | None = None


class SizeOut(SQLModel):
    """Talla tal como la devuelve la API."""

    id: uuid.UUID
    child_id: uuid.UUID
    type: SizeType
    label: str
    recorded_at: date
    recorded_by: str
    created_at: datetime


class CurrentSizesOut(SQLModel):
    """Tallas actuales por tipo: la más reciente de cada uno."""

    clothing: SizeOut | None = None
    footwear: SizeOut | None = None


class HealthVisit(SQLModel, table=True):
    """Registro histórico de atención sanitaria a un Hijo, con diagnóstico.

    Las `notes` (JSONB) almacenan notas libres / tratamiento como texto; la
    columna es nullable. `family_id` + RLS aíslan por Familia; `created_by`
    atribuye la acción al Miembro. No es una cita futura (eso es un Evento).
    """

    __tablename__ = "health_visits"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    child_id: uuid.UUID = Field(foreign_key="children.id", index=True)
    visited_at: date
    diagnosis: str
    notes: dict | list | str | None = Field(
        default=None, sa_column=Column(sa.JSON(), nullable=True)
    )
    created_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        )
    )


class HealthVisitCreate(SQLModel):
    """Cuerpo del alta de una Visita médica (sin family_id ni created_by)."""

    visited_at: date
    diagnosis: str
    notes: dict | list | str | None = None


class HealthVisitUpdate(SQLModel):
    """Edición parcial de una Visita médica."""

    visited_at: date | None = None
    diagnosis: str | None = None
    notes: dict | list | str | None = None


class HealthVisitOut(SQLModel):
    """Visita médica tal como la devuelve el backend al frontend."""

    id: uuid.UUID
    child_id: uuid.UUID
    family_id: str
    visited_at: date
    diagnosis: str
    notes: dict | list | str | None = None
    pauta_ids: list[str] = Field(default_factory=list)
    created_by: str
    created_at: datetime


class McpToken(SQLModel, table=True):
    """Token MCP de un Miembro (ADR-0001); resuelve a su Miembro → Familia.

    El valor en claro nunca se persiste: `token_hash` es su SHA-256. `revoked_at`
    son los metadatos de revocación (nullable = activo). `family_id` lo fija el
    backend desde el contexto (RLS); `member_id` lo acota al Miembro autenticado.
    """

    __tablename__ = "mcp_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    member_id: str = Field(foreign_key="members.id", index=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    token_hash: str
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    revoked_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class InvitationCreate(SQLModel):
    """Cuerpo del alta de una invitación (solo se requiere el email)."""

    email_address: str


class InvitationOut(SQLModel):
    """Representación de una invitación tal como la devuelve Clerk."""

    id: str
    email_address: str
    role: str
    status: str
    created_at: int


class McpTokenCreated(SQLModel):
    """Respuesta del alta: el valor en claro (una sola vez) + metadata."""

    id: uuid.UUID
    token: str
    created_at: datetime


class McpTokenOut(SQLModel):
    """Metadata de un token para el listado; nunca el valor en claro ni el hash."""

    id: uuid.UUID
    created_at: datetime
    revoked_at: datetime | None


# ---------- Pautas (tratamientos) ----------


PautaStatus = Literal["active", "finished"]


class Pauta(SQLModel, table=True):
    """Pauta: instrucción de tratamiento activa para un Hijo.

    `ends_at` y `day_number` son calculados (no persistidos). La finalización
    automática se aplica lazily al consultar (si `now >= started_at + duration_days`).
    """

    __tablename__ = "pautas"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    child_id: uuid.UUID = Field(foreign_key="children.id", index=True)
    medication: str
    dose: str
    interval_hours: int
    duration_days: int
    started_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    status: str = Field(default="active")
    health_visit_id: uuid.UUID | None = Field(default=None)
    created_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )

    @property
    def ends_at(self) -> datetime:
        return self.started_at + timedelta(days=self.duration_days)

    @property
    def day_number(self) -> int:
        now = datetime.now(UTC)
        elapsed = now - self.started_at
        return max(1, min(int(elapsed.total_seconds() / 86400) + 1, self.duration_days))

    @property
    def is_expired(self) -> bool:
        return datetime.now(UTC) >= self.ends_at


class PautaCreate(SQLModel):
    """Cuerpo para iniciar una Pauta (sin family_id/created_by: servidor)."""

    child_id: uuid.UUID
    medication: str
    dose: str
    interval_hours: int
    duration_days: int
    health_visit_id: uuid.UUID | None = None


class PautaOut(SQLModel):
    """Representación de Pauta para la API REST con campos calculados."""

    id: uuid.UUID
    family_id: str
    child_id: uuid.UUID
    medication: str
    dose: str
    interval_hours: int
    duration_days: int
    started_at: datetime
    ends_at: datetime
    status: str
    health_visit_id: uuid.UUID | None
    created_by: str
    created_at: datetime
    day_number: int
    next_dose_at: datetime | None


# ---------- Administraciones (dosis registradas) ----------

# Ventana corta para la guarda de duplicado: si llega otra Administración de la
# misma Pauta dentro de estos minutos, se ignora y se devuelve la existente.
DUPLICATE_GUARD_MINUTES: int = 15


class Administration(SQLModel, table=True):
    """Administración: acto registrado de dar una dosis de una Pauta.

    `administered_at` es cuándo se dio la dosis; `administered_by` es el Miembro
    que la registró. `family_id` + RLS aíslan por Familia.
    """

    __tablename__ = "administrations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: str = Field(foreign_key="families.id", index=True)
    pauta_id: uuid.UUID = Field(foreign_key="pautas.id", index=True)
    administered_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    administered_by: str = Field(foreign_key="members.id")
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        )
    )


class AdministrationOut(SQLModel):
    """Administración tal como la devuelve la API."""

    id: uuid.UUID
    pauta_id: uuid.UUID
    administered_at: datetime
    administered_by: str
    created_at: datetime
