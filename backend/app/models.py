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
