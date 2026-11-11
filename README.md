# Mini TaskFlow - Backend

Express backend starter for the Mini TaskFlow group project.

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env`, then enter your own MySQL connection details and a long random `SESSION_SECRET`. Never commit `.env`.

## 3. Database tables expected

Coordinate with Person 4 before running the API. These routes expect the following columns:

- `users`: `user_id`, `username`, `email` (unique), `password_hash`
- `projects`: `project_id`, `project_name`, `description`, `deadline` (DATE, NOT NULL), `join_code` (unique), `owner_id`, `created_at`
- `project_members`: `project_id`, `user_id`, `joined_at` (composite primary key on project_id + user_id)

The database and session table must be created in MySQL first. The session store creates its own `sessions` table automatically when the database user has permission.

## 4. Run

```bash
npm run dev
```

API base URL: `http://localhost:3000/api`

Health check: `GET http://localhost:3000/api/health`

## 5. Authentication endpoints

- `POST /api/register` - JSON: `{ "username": "student", "email": "student@example.com", "password": "password123" }`
- `POST /api/login` - JSON: `{ "email": "student@example.com", "password": "password123" }`
- `POST /api/logout`
- `GET /api/me`

Authentication uses a server-side session cookie. When testing in Postman, keep cookies enabled between requests.

## 6. Project endpoints (login required)

- `GET /api/projects`
- `POST /api/projects` - JSON: `{ "project_name": "Database Final", "description": "Group assignment", "deadline": "2026-12-01" }`
- `POST /api/projects/join` - JSON: `{ "join_code": "A1B2C3D4E5" }`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `GET /api/projects/:id/members`

## Notes for the team

- Person 4 owns the database schema and Task API. Confirm exact column names and types with them before integration.
- Project deadline is mandatory. Task due-date validation against the project deadline must also be enforced by the Task API.
- The project update route currently checks that the new project deadline is not in the past. Person 4 should add a check that it does not move earlier than any existing task due date.
- The app is configured for same-origin frontend/API usage. If the frontend is hosted on a different origin, coordinate cookie and CORS settings before changing this setup.
