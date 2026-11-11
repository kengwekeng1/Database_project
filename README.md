# Mini TaskFlow - Backend

Express backend starter for the Mini TaskFlow group project.

## 1. Install dependencies

```bash
npm install
```

## 2. Configure Firebase

Copy `.env.example` to `.env` and set `FIREBASE_PROJECT_ID`. Leave `FIRESTORE_DATABASE_ID` blank to use `(default)`, or enter the Firestore database ID supplied by your team.

For local development, create a Firebase service account with Firestore access, download its JSON key outside this repository, and set `GOOGLE_APPLICATION_CREDENTIALS` to its path. On Windows, use forward slashes in the path. Never commit or share the key or `.env` file. Google Application Default Credentials can also be used instead of a service-account key.

## 3. Firestore collections

The API uses these collections and documents:

- `users/{userId}` stores username, email, password hash, and creation time.
- `userEmails/{emailHex}` maps a normalized email to its user ID to enforce unique registration.
- `projects/{projectId}` stores project details and member IDs.
- `projects/{projectId}/members/{userId}` stores each member and their join time.
- `joinCodes/{code}` maps invite codes to project IDs.

Firestore creates collections and documents as the API writes them. Confirm the collection structure with your team before connecting to shared project data.

## 4. Run

```bash
npm run dev
```

API base URL: `http://localhost:3000/api`

Health check: `GET http://localhost:3000/api/health` (checks Firestore connectivity)

## 5. Authentication endpoints

- `POST /api/register` - JSON: `{ "username": "student", "email": "student@example.com", "password": "password123" }`
- `POST /api/login` - JSON: `{ "email": "student@example.com", "password": "password123" }`
- `POST /api/logout`
- `GET /api/me`

Authentication uses a server-side session cookie. For local development, sessions use Express's in-memory store and are cleared when the server restarts. When testing in Postman, keep cookies enabled between requests. Use a persistent session store before deploying to production.

## 6. Project endpoints (login required)

- `GET /api/projects`
- `POST /api/projects` - JSON: `{ "project_name": "Database Final", "description": "Group assignment", "deadline": "2026-12-01" }`
- `POST /api/projects/join` - JSON: `{ "join_code": "A1B2C3D4E5" }`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `GET /api/projects/:id/members`

## Notes for the team

- Confirm the Firestore database ID and collection structure with your team before integration.
- Project deadline is mandatory. Task due-date validation against the project deadline must also be enforced by the Task API.
- The project update route currently checks that the new project deadline is not in the past. Person 4 should add a check that it does not move earlier than any existing task due date.
- The app is configured for same-origin frontend/API usage. If the frontend is hosted on a different origin, coordinate cookie and CORS settings before changing this setup.
