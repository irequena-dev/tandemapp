import uuid
from datetime import date

from sqlmodel import Field, SQLModel


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
