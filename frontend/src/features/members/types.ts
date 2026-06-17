/** Miembro de la Familia, tal como lo devuelve GET /members. */
export type Member = {
  id: string
  family_id: string
  display_name: string | null
}

/** Invitación pendiente, tal como la devuelve GET /invitations. */
export type Invitation = {
  id: string
  email_address: string
  role: string
  status: string
  created_at: number
}

/** Cuerpo para POST /invitations. */
export type InvitationCreate = {
  email_address: string
}
