# BillBook

Split shared expenses within a group and see who owes whom, in each currency.

BillBook tracks groups of people, the expenses they share, and the settlements
they pay each other. For each group it shows your balance with every other
member: who owes you, and whom you owe.

The repository is a monorepo with two npm packages, `backend/` and `frontend/`,
which is why their package names don't match the project name.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Known limitations](#known-limitations)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

BillBook is a personal learning project. The domain is simple on purpose, so the
interesting work is in getting the details right:

- **Money is exact.** Amounts are stored as integer cents, never floats.
- **Currencies don't mix.** Balances are kept per currency and never converted.
- **Splits must add up.** Every expense is divided into shares that sum exactly to
  its total, and the payer always holds a share of their own expense.
  Overpaying a settlement is allowed; the balance simply flips.
- **Removing a user doesn't break history.** Users are soft-deleted: their personal
  details are erased, but past expenses still add up.
- **Tests run against a real database.** Integration tests use PostgreSQL, not mocks,
  and CI runs them on every push and pull request to `main`.

The stack is Express 5, Prisma 7 and PostgreSQL 18 on the backend, and React 19,
React Router and TanStack Query on the frontend, all in TypeScript.

## Install

### Dependencies

- [Node.js](https://nodejs.org/) 26 (the version CI uses)
- [Docker](https://www.docker.com/), to run PostgreSQL

### Steps

Start a PostgreSQL container for development. Its data lives in the
`postgres-data` volume, so it survives restarts:

```bash
docker run -d --name billbook-db \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=db \
  -v postgres-data:/var/lib/postgresql \
  -p 5432:5432 postgres:18
```

Later, `docker start billbook-db` brings it back up.

Set up the backend. The example config already points at this database:

```bash
cd backend
npm install
cp .env.example .env
```

Then create the tables and fill them with sample data:

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

Set up the frontend:

```bash
cd ../frontend
npm install
```

Create `frontend/.env`:

```
VITE_API_URL=http://localhost:3000/api
VITE_DEV_USER_ID=1
```

`VITE_DEV_USER_ID` is the user the frontend acts as (see
[Known limitations](#known-limitations)). User 1 is `alice` from the seed data.
Seeding wipes the database and restarts ids, so this holds however often you
re-seed.

## Usage

Run the backend and the frontend in two terminals:

```bash
cd backend && npm run dev     # API on http://localhost:3000
cd frontend && npm run dev    # app on http://localhost:5173
```

Open <http://localhost:5173>. You'll see the groups the current user belongs to
and their balance in each. Open a group to see its expenses and settlements, add
an expense, or settle up with another member.

### Tests

The backend's integration tests use their own database, `testdb`, on the
development PostgreSQL container. It's created and migrated automatically; you
only need the config file:

```bash
cp backend/.env.test.example backend/.env.test
```

Then, with the database running:

```bash
cd backend && npm test     # unit + integration tests
cd frontend && npm test
```

### Production build

`docker compose up --build` builds and runs the whole stack, with its own
PostgreSQL. It isn't the development database: it's a separate database, in its
own volume. It also uses ports 5432 and 3000, so stop the development backend
and the development database (`docker stop billbook-db`) first.

The app is served on <http://localhost> and the API on <http://localhost:3000>.
This build starts with an **empty database**, and the seed script refuses to run
in production, so there is nothing to look at yet. Use the local setup above to
try the app.

## Known limitations

- **No authentication.** Every request names its user in an `X-User-Id` header,
  which the server trusts. The frontend takes it from `VITE_DEV_USER_ID`. A real
  login will replace this.
- **No request validation.** Request bodies aren't checked yet. Some malformed input
  is caught by the database layer and returns a 400. The rest can return a 500.
- **No user management.** Users can't be created or deleted, from the app or the
  API; the sample users come from the seed script. Groups can be created through
  the API, but not from the app.

## API

All routes live under `/api` and need an `X-User-Id` header. Amounts are integer
cents, and `currency` is one of `USD`, `EUR` or `ILS`.

| Method | Route | Body | Returns |
| ------ | ----- | ---- | ------- |
| `GET` | `/groups` | | Your groups, each with your balances |
| `GET` | `/groups/:id` | | The group, its members, the expenses and settlements involving you, and your balances |
| `POST` | `/groups` | `{ name, userIds }` | The new group |
| `POST` | `/groups/:id/expenses` | `{ expense: { description, amountCents, currency }, shares: [{ owerId, amountCents }] }` | The new expense, paid by you |
| `POST` | `/groups/:id/settlements` | `{ userToId, amountCents, currency }` | The new settlement, paid by you |

Errors come back as `{ "error": "..." }`:

- `400`: the body isn't valid JSON, or has fields the database rejects.
- `401`: the `X-User-Id` header is missing or not a valid id.
- `404`: the group doesn't exist, or you aren't a member of it.
- `422`: the request breaks a rule, e.g. shares that don't add up to the total,
  or a user who isn't in the group.

## Contributing

This is a personal learning project, so I'm not accepting pull requests or
issues.

## License

[MIT](LICENSE) © Oren Ongil
