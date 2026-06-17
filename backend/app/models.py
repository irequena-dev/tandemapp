import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import sqlalchemy as sa
from pydantic import field_validator
from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel

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
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )


class ShoppingItemCreate(SQLModel):
    """Cuerpo del alta de un Ítem de compra (texto libre, sin `family_id`)."""

    text: str


class ShoppingItemOut(SQLModel):
    """Representación de un Ítem de compra para el frontend."""

    id: uuid.UUID
    family_id: str
    text: str
    status: str
    created_by: str
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
