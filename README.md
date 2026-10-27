# KBA Portal API

NestJS backend for the Karachi Bar Association Document Portal.

## Step 1 — Auth + roles

Roles: `ADMIN`, `STAFF`, `PUBLIC`

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/register` | Public self-registration → `PUBLIC` |
| POST | `/api/auth/login` | All roles |
| GET | `/api/auth/me` | JWT required |
| GET | `/api/auth/admin-only` | `ADMIN` |
| GET | `/api/auth/staff-area` | `STAFF`, `ADMIN` |
| GET | `/api/auth/member-area` | Any authenticated role |

## Setup

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

API: `http://localhost:4000/api`

### Seed users (password: `Password123!`)

- `admin@kba.local` — ADMIN  
- `staff@kba.local` — STAFF  
- `public@kba.local` — PUBLIC  

Local DB uses SQLite (`prisma/dev.db`) for quick demos. Switch `DATABASE_URL` to PostgreSQL later for production.

## Step 2 — Documents + private storage

| Method | Path | Access |
|--------|------|--------|
| GET | `/api/categories` | STAFF, ADMIN |
| POST | `/api/categories` | ADMIN |
| GET | `/api/documents` | STAFF (own), ADMIN (all) |
| POST | `/api/documents` | STAFF, ADMIN (multipart: `file` + metadata) |
| GET | `/api/documents/:id/file` | Owner staff / ADMIN (auth required — private) |
| PUT | `/api/documents/:id/file` | Replace private file |
| PATCH / DELETE | `/api/documents/:id` | Owner staff / ADMIN |

Default storage: **local** folder `storage/private` (`STORAGE_DRIVER=local`).

### Mobile sync (Step 3)

`POST /api/documents` with form field `source=MOBILE_SCAN` (from `kbaMobileApp`).

Optional MinIO:

```bash
docker compose -f docker-compose.minio.yml up -d
# set STORAGE_DRIVER=minio in .env
```
