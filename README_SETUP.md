# Metering Studio — Dashboard integration

This is an **add-on** for the existing `usage-metering-quota-service` repository, not a replacement repository. It does not require React, CORS, additional npm packages, or a new Docker service. The browser UI is served by the existing Express API and uses real HTTP endpoints.

## Copy the files

Copy the contents of this ZIP into the **root** of your existing repository (where `package.json` lives). Preserve these folders and paths:

- `public/dashboard/index.html` — dashboard markup
- `public/dashboard/styles.css` — responsive visual design
- `public/dashboard/app.js` — browser API client and interactions
- `services/user-directory.service.ts` — account-scoped user listing
- `routes/user-directory.routes.ts` — secured, paginated `GET /users`
- `tests/integration/user-directory.test.ts` — auth, isolation and pagination tests
- `app.ts` — mounts the new browser UI and the user directory
- `Dockerfile` — copies static assets into the production image

`app.ts` and `Dockerfile` **replace** their counterparts in your repository. If you have made additional edits to either file, merge the changes rather than overwriting your edits. The previous "final-fixes" ZIP changed other files, not these two, so the packages are compatible.

Do **not** remove your existing `examples/document-client.ts` or its Docker Compose service. The CLI remains useful to demonstrate the original project specification; this UI is an extra interface.

## Run it locally

```powershell
npm.cmd ci
npm.cmd run typecheck

docker compose -f compose.test.yml up -d --wait
npm.cmd run test:all

docker compose up -d --build --wait api
```

Open **http://localhost:3000/dashboard/**

If the API was running in Docker before, `--build` is important because the Dockerfile now copies the `public/` directory.

## First use

Select one of the two entry paths:

1. **Connect workspace:** Enter an existing `x-api-key` for an account created through `POST /accounts`.
2. **Create demo workspace:** Calls `POST /accounts` with the Starter plan, then creates Alice (Basic plan) and Bob (Premium plan). The new API key is held in memory, with a one-time **Copy API key** prompt. Save it before refreshing.

The browser does **not** store API keys in `localStorage`, `sessionStorage`, cookies, or a backend session. Refreshing or closing the tab requires reconnecting. Use this as a local developer demo, not as a public production admin portal without adding TLS, controlled account onboarding and other security hardening.

## What the dashboard can do

- **Overview:** Account usage/remaining/monthly allowance, user count, per-user utilization and recent decisions
- **Consumption:** Submit units and request IDs; show original accept/reject decisions and balances; retain request ID for retry demo
- **Users:** Create users, browse 100 users per page, assign user plans
- **Plans:** Inspect predefined/custom plans, create and edit custom plans (with expected-version checks), switch account plan
- **Activity:** Browse paginated history by UTC month, with rejection reasons

The Overview shows the current UTC month's usage. The Activity month picker changes **only** the history view. Usage-by-user shows a maximum of six users from the current user-directory page; it is explicitly a quick overview, not a global rollup.

## Additional API endpoint

`GET /users?page=1&pageSize=20`

Header: `x-api-key: <the-account-api-key>`

Defaults: page `1`, page size `20`. Maximum page size: `100`. The response contains only the authenticated account's users:

```json
{
  "users": [
    {
      "id": "...",
      "accountId": "...",
      "externalId": "Alice",
      "planId": "...",
      "createdAt": "2026-10-20T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

Missing/invalid keys return `401`, invalid page or page size returns `400` (standard project errors).

## README addition suggestion

Add one new row to your API endpoint table:

| GET | `/users?page=1&pageSize=20` | List the authenticated account's users, paginated |

Then add under "Example client":

> A browser-based example dashboard is also available at `http://localhost:3000/dashboard/`. It provides a visual overview, account/user quota gauges, user/plan administration and an interactive consumption demo. The original CLI example still runs automatically in Docker Compose.

## Validation and release checklist

1. `npm.cmd run typecheck` succeeds.
2. `npm.cmd run test:all` succeeds with the added user-directory tests.
3. `docker compose up -d --build --wait api` starts cleanly.
4. Open `/dashboard/`; create a demo account and copy the API key.
5. Submit a valid consumption request and see the balances and history update.
6. Submit a request above a user's max-per-request limit and verify its rejection.
7. Edit or reassign a plan and observe its new rules on subsequent requests.
8. Refresh the page, reconnect using the saved API key, and verify the same users are listed.

## What was / was not run while preparing this package

- JavaScript parser check: `node --check public/dashboard/app.js` — **passed**.
- TypeScript syntax parse of the new and modified `.ts` files — **passed**.
- Rendered desktop and mobile previews, verified page navigation across all five views with a mocked API, and checked mobile horizontal overflow — **passed** (sample data in preview, not a live DB connection).
- Live PostgreSQL integration tests, full TypeScript type-check with the repository's dependency graph, and Docker startup — **not run** in the packaging environment; run the checklist above on your machine.

All Git/GitHub commits and pull requests are left entirely to you.
