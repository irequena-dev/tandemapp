# Frontend conventions

- **React 19 + Vite + TypeScript**, set up as a **PWA**. Package manager: **pnpm**.
- **Auth**: `@clerk/react` (NOT `@clerk/nextjs` nor `@clerk/clerk-react`). New API: conditional rendering with `<Show when="signed-in" | "signed-out">`, `OrganizationSwitcher` for the Familia (≡ Clerk Organization), `UserButton`.
- **State/data**: TanStack Query **planned** (Phase 1+), with optimistic updates + refetch on focus ("real time" = optimistic + refetch, no push). *(Not installed yet.)*
- **API**: `VITE_API_URL` (defaults to `http://localhost:8000`). The backend CORS trusts `FRONTEND_ORIGIN`; that's why Vite uses a **fixed port 5173** (`strictPort`): if it's taken, it fails instead of drifting to another port and breaking CORS.
- **Build**: `tsc -b && vite build` (typecheck runs as part of the build).

For UI work, follow `PRODUCT.md` (strategic design context) and `DESIGN.md` (visual system; tokens are normative, sidecar `.impeccable/design.json`).
