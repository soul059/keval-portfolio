# Keval Portfolio Backend

Separate deployable backend for admin config/blog management, image uploads, and analytics.

## Features
- MongoDB with Mongoose models
- Admin-only auth (no signup; seeded via script)
- Username/password login for seeded admin
- Blog CRUD with Cloudinary image upload
- Site config update + config version history
- Analytics ingest + admin analytics summary
- Audit logs for admin actions
- Security hardening: helmet, strict CORS, route rate limits, JWT auth, failed-login lockout

## Setup
1. Copy `.env.example` to `.env`
2. Fill env values
3. Install deps (already in this repo): `npm install`
4. Seed admin: `npm run seed:admin`
5. Start dev server: `npm run dev`

## Scripts
- `npm run dev` - tsx watch mode
- `npm run build` - build to `dist`
- `npm run start` - run compiled backend
- `npm run seed:admin` - create/update admin user

## Render deployment
- Root directory: `backend`
- Build command: `npm run build`
- Start command: `npm run start`
- Add environment variables from `.env.example`
- Use long random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`

## API overview
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/blogs`
- `GET /api/blogs/:slug`
- `POST /api/analytics/event`
- `GET/PUT /api/admin/config`
- `GET /api/admin/config/versions`
- `GET/POST/PUT/DELETE /api/admin/blogs`
- `POST /api/admin/uploads/image` (multipart form-data `image`)
- `GET /api/admin/analytics/summary`
- `GET /api/admin/analytics/events`
- `GET /api/admin/audit-logs`

## Frontend data source recommendation
- Keep static portfolio content (`about`, `projects`, banner/help text, themes) in frontend `config.json` for fast initial load.
- Use backend only for dynamic/secure data: admin auth, blog CRUD, uploads, analytics, audit logs, and optional live config overrides.
