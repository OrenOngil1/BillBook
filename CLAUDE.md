# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BillBook is an expense-splitting app (groups, expenses split into shares, settlements, per-user balances).

- `backend/` — Express 5 + Prisma 7 + PostgreSQL 18, TypeScript 6, ESM.
- `frontend/` — Vite + React 19 + React Router + TanStack 

## Common Commands

```bash
cd backend && npm run dev               # start backend
cd frontend && npm run dev              # start frontend
cd backend && npx prisma migrate dev    # run migrations
cd backend && npx prisma db seed        # seed database
npm test                                # Vitest, in either directory
docker compose up --build               # full stack
```

## Testing

Unit tests: *.test.ts next to source files
Integration tests: *.test.ts in a seperate tests/ folder

## Architecture

- Monorepo: backend/ (Node.js) + frontend/ (React app)
- Docker multi-stage builds

## Code Conventions

- IMPORTANT: Always use curly braces for single-line if/for/else
- IMPORTANT: Use early return pattern
- Prisma error codes mapped to HTTP responses
- No default exports except for React components

### Prisma 7 specifics

This is Prisma 7, which differs from older versions most documentation describes: the datasource URL lives in `prisma7.config.ts` (not `schema.prisma`), the client is created with the `@prisma/adapter-pg` driver adapter, and the client is generated into `src/generated/prisma/` (gitignored) rather than `node_modules`. Import types and enums from `../generated/prisma/client.js` / `enums.js`. Prisma reference docs are vendored under `backend/.agents/skills/prisma-*` — consult those rather than relying on memory of older Prisma APIs.

### Soft delete (User only)

`src/extentions/softDelete.ts` is a Prisma client extension that:

- adds `prisma.user.softDelete()` / `softDeleteMany()`, which set `deletedAt` and null out `email` and `username`;
- rewrites every `user` query (except create/delete variants) to add `deletedAt: null`, unless the caller's `where` already specifies `deletedAt` — passing an explicit `deletedAt` filter is how you opt out.

The filter applies to queries on the `user` model only, not to users reached through relations (e.g. `group.members`). The database enforces the pairing with CHECK constraints (`email`/`username` are null exactly when `deletedAt` is set); these were hand-written in the `add_soft_delete` migration SQL and are not visible in `schema.prisma`.

### Not built yet

- **Auth.** The acting user's id currently comes from a request placeholder header. TODOs mark where the token's `sub` claim will replace it.
- **Request validation.** Bodies are not validated (zod is only used for env). As a stopgap, `errorHandler` maps `PrismaClientValidationError` to 400; that is marked to become a 500 once validation exists.
