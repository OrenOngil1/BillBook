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

BillBook is a personal learning project. I'm using it to go deeper into the
React and Node stack than tutorials go: past the happy path, into the parts a
real app can't skip. The domain is simple on purpose, so the interesting work is
in getting the details right.

The domain rules:

- **Money is exact.** Amounts are stored as integer cents, never floats.
- **Currencies don't mix.** Balances are kept per currency and never converted.
- **Splits must add up.** Every expense is divided into shares that sum exactly to
  its total, and the payer always holds a share of their own expense.
  Overpaying a settlement is allowed; the balance simply flips.
- **Removing a user doesn't break history.** Users are soft-deleted: their personal
  details are erased, but past expenses still add up.

The engineering around them:

- **Authentication.** Short-lived JWT access tokens, and refresh tokens that are
  replaced on every use. The refresh token lives in an httpOnly cookie, and the
  database stores only its SHA-256 hash. Passwords are hashed with argon2id.
- **Validation.** Request bodies are checked against zod schemas before they
  reach a handler, and the environment is checked at startup.
- **Defensive defaults.** Security headers, rate limiting, and an error handler
  that maps validation and database errors to HTTP statuses without leaking
  internal details.
- **Observability.** Structured JSON logs, each tagged with the request it came
  from, and health and readiness endpoints.
- **Tests at two levels.** Unit tests with a mocked database client, and
  integration tests against a real PostgreSQL database. CI runs them on every
  push and pull request to `main`.

The stack is Express 5, Prisma 7 and PostgreSQL 18 on the backend, and React 19,
React Router and TanStack Query on the frontend, all in TypeScript. Logging is
pino, validation is zod, and tokens are signed with jose.

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

`.env` contains a placeholder `JWT_ACCESS_SECRET`. Replace it with a random
string of at least 32 characters; the server refuses to start with a shorter
one. This prints a suitable value:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
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

`VITE_DEV_USER_ID` is left over from before the API had logins (see
[Known limitations](#known-limitations)).

## Usage

Run the backend and the frontend in two terminals:

```bash
cd backend && npm run dev     # API on http://localhost:3000
cd frontend && npm run dev    # app on http://localhost:5173
```

The frontend doesn't log in yet (see [Known limitations](#known-limitations)),
so for now the API is the way in. Register a user, keeping the refresh cookie in
`cookies.txt`:

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","username":"me","password":"at-least-8-chars"}'
```

The response holds an `accessToken`. Send it with each group request:

```bash
curl http://localhost:3000/api/groups -H "Authorization: Bearer <accessToken>"
```

Access tokens expire after 15 minutes. To get a new one, refresh with the cookie:

```bash
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/refresh
```

### Tests

The backend's integration tests use their own database, `testdb`, on the
development PostgreSQL container. It's created and migrated automatically; you
only need the config file:

```bash
cp backend/.env.test.example backend/.env.test
```

Its `JWT_ACCESS_SECRET` also needs at least 32 characters. Then, with the
database running:

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
in production.

The `JWT_ACCESS_SECRET` in `docker-compose.yml` is a placeholder for running the
build locally. A real deployment sets its own secret through the environment.

## Known limitations

- **The frontend predates logins.** It still names its user in an `X-User-Id`
  header taken from `VITE_DEV_USER_ID`. The API no longer accepts that header, so
  every request the frontend makes gets a 401. It needs a login page and token
  handling.
- **Seeded users can't log in.** The seed script creates users without passwords.
  Register a new user instead.
- **Logging out doesn't end the access token.** Logout deletes the refresh token,
  but an access token that was already issued keeps working until it expires, up
  to 15 minutes later.
- **Admins can only be made in the database.** Users with the `ADMIN` role can see
  every group, but nothing in the API assigns that role.
- **No user management beyond registering.** Users can't be edited or deleted
  through the API. Groups can be created through the API, but not from the app.
- **Rate limits live in memory.** Counts are kept per server process and reset when
  it restarts.

## API

All routes live under `/api`. Amounts are integer cents, and `currency` is one of
`USD`, `EUR` or `ILS`.

### Auth

| Method | Route | Body | Returns |
| ------ | ----- | ---- | ------- |
| `POST` | `/auth/register` | `{ email, username, password }` | `201` with `{ user, accessToken }`, and sets the refresh cookie |
| `POST` | `/auth/login` | `{ email, password }` | `200` with `{ user, accessToken }`, sets the refresh cookie, and ends your other sessions |
| `POST` | `/auth/refresh` | | `200` with `{ user, accessToken }`, and replaces the refresh cookie |
| `POST` | `/auth/logout` | | `204`, and clears the refresh cookie |

Passwords need at least 8 characters. Access tokens last 15 minutes and refresh
tokens 7 days. The refresh cookie is httpOnly, `SameSite=Strict`, and only sent
to `/api/auth`. Each refresh token works once: refreshing replaces it with a new
one.

### Groups

Every group route needs an `Authorization: Bearer <accessToken>` header.

| Method | Route | Body | Returns |
| ------ | ----- | ---- | ------- |
| `GET` | `/groups` | | Your groups, each with your balances |
| `GET` | `/groups/:id` | | The group, its members, the expenses and settlements involving you, and your balances |
| `POST` | `/groups` | `{ name, memberIds }` | The new group. You're added as a member automatically |
| `POST` | `/groups/:id/expenses` | `{ expense: { description, amountCents, currency }, shares: [{ owerId, amountCents }] }` | The new expense, paid by you |
| `POST` | `/groups/:id/settlements` | `{ userToId, amountCents, currency }` | The new settlement, paid by you |

Admins see every group, not only their own.

### Health

These live at the root, not under `/api`.

| Method | Route | Returns |
| ------ | ----- | ------- |
| `GET` | `/healthz` | `200` while the server is running |
| `GET` | `/readyz` | `200` when the database is reachable, `503` when it isn't |

### Errors

Errors come back as `{ "error": "..." }`, except for rate-limit responses:

- `400`: the body isn't valid JSON, or fails validation. Validation errors list
  every problem: `{ "error": [{ "path", "message" }] }`.
- `401`: the access token is missing, invalid or expired; the email or password
  is wrong; or the refresh cookie is missing or no longer valid. An expired
  access token has its own message, so a client knows to refresh.
- `404`: the group doesn't exist, you aren't a member of it, or a user id in the
  body doesn't exist.
- `409`: the record already exists, e.g. an email that's already registered.
- `422`: the request breaks a rule, e.g. shares that don't add up to the total,
  or a user who isn't in the group.
- `429`: too many requests. Each IP gets 100 API requests and 5 failed auth
  requests per 15 minutes.

## Contributing

This is a personal learning project, so I'm not accepting pull requests or
issues.

## License

[MIT](LICENSE) © Oren Ongil
