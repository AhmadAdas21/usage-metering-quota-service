# Usage Metering & Quota Service

A TypeScript and PostgreSQL service for tracking monthly usage and enforcing account-level and user-level quotas.

Consumption decisions are transactional, account-isolated, and idempotent. The repository includes an HTTP API, a document-processing CLI demo, automated tests, and load-test reports.

## Features

- Predefined and custom account/user plans.
- Monthly allowances and per-request limits.
- Account authentication through API keys.
- All-or-nothing consumption across account and user balances.
- Idempotent requests with persisted results.
- PostgreSQL locking to protect quotas under concurrent requests.
- Plan changes that preserve consumed units and request history.
- Monthly usage queries and filtered, paginated history.
- Docker Compose setup with automatic migrations and predefined seeds.

## Quick start with Docker

Requirements:

- Docker Engine or Docker Desktop.
- Docker Compose v2.

From the repository root:

```sh
docker compose up --build
```

Compose starts PostgreSQL, initializes the database, starts the API, and runs the example client after the API becomes healthy.

- API: `http://localhost:3000`
- Health endpoint: `http://localhost:3000/health`
- PostgreSQL host port: `5433`

No local Node.js installation or `.env` file is needed for this Docker workflow.

The example client exits after completing its scenarios. An exit code of `0` is expected; PostgreSQL and the API continue running.

Inspect the demo output:

```sh
docker compose logs example-client
```

Run the demo again:

```sh
docker compose run --rm example-client
```

Each demo run creates a new account and users.

Stop the stack:

```sh
docker compose down
```

Database data is stored in a named volume and survives this command.

## Example client

The example simulates document processing: a document is processed only after its consumption request is accepted.

It creates these initial quotas:

| Owner | Monthly allowance | Maximum units per request |
| --- | ---: | ---: |
| Account | 30 | 100 |
| Alice | 10 | 10 |
| Bob | 100 | 50 |

It demonstrates:

1. Alice consumes 10 units successfully.
2. Alice's next request is rejected because her monthly allowance is exhausted.
3. Bob consumes 20 units successfully.
4. Bob's next request is rejected because the shared account allowance is exhausted.
5. The account allowance increases from 30 to 50.
6. Bob submits a new request and successfully consumes one more unit.

Final usage:

| Owner | Used | Remaining |
| --- | ---: | ---: |
| Account | 31 | 19 |
| Alice | 10 | 0 |
| Bob | 21 | 79 |

The client simulates processing; it does not parse or upload real documents.

## Local development

Use Node.js 24 and npm. The Docker image also uses Node.js 24.

Install dependencies:

```sh
npm ci
```

Start PostgreSQL:

```sh
docker compose up -d --wait postgres
```

Create a `.env` file in the repository root:

```dotenv
DATABASE_URL=postgresql://usage_app:local_dev_password@localhost:5433/usage_metering
PORT=3000
```

Initialize the database and start the API:

```sh
npm run db:init
npm run dev
```

If the Docker API is already running, stop it first to free port `3000`:

```sh
docker compose stop api
```

Run the example from another terminal:

```sh
npx ts-node examples/document-client.ts
```

The client defaults to `http://localhost:3000`. Set `API_BASE_URL` to use another API address.

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy prevents running `npm` or `npx`.

## API overview

Except for health checks and account creation, endpoints require:

```http
x-api-key: <account-api-key>
```

Send JSON request bodies with `Content-Type: application/json`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Check API and database availability |
| POST | `/accounts` | Create an account and issue its API key |
| GET | `/accounts/me` | Read the authenticated account |
| PUT | `/accounts/me/plan` | Change the account's assigned plan |
| GET | `/plans` | List predefined and account-owned plans |
| POST | `/plans` | Create a custom plan |
| PUT | `/plans/:planId` | Update an owned custom plan |
| POST | `/users` | Create a user within the account |
| PUT | `/users/:userId/plan` | Change a user's assigned plan |
| POST | `/consumption` | Submit or replay a consumption request |
| GET | `/usage/account` | Read account usage for a month |
| GET | `/usage/users/:userId` | Read user usage for a month |
| GET | `/usage/history` | Read filtered, paginated request history |

### Predefined plans

| Plan | Scope | Monthly allowance | Per-request limit | ID |
| --- | --- | ---: | ---: | --- |
| Starter | account | 10000 | 100 | `00000000-0000-4000-8000-000000000001` |
| Pro | account | 100000 | 1000 | `00000000-0000-4000-8000-000000000002` |
| Basic | user | 1000 | 20 | `00000000-0000-4000-8000-000000000003` |
| Premium | user | 10000 | 200 | `00000000-0000-4000-8000-000000000004` |

Predefined plans are seeded without duplication and cannot be edited through the custom-plan update endpoint.

### Create an account

`POST /accounts`

```json
{
  "name": "Example account",
  "planId": "00000000-0000-4000-8000-000000000001"
}
```

Save the API key returned during creation and use it in subsequent requests. Account reads do not expose the key.

### Create a user

`POST /users`

```json
{
  "externalId": "alice",
  "planId": "00000000-0000-4000-8000-000000000003"
}
```

Use the returned user ID when submitting consumption requests. External user IDs are unique within an account.

### Consume units

`POST /consumption`

```json
{
  "userId": "<created-user-id>",
  "requestId": "document-report-001",
  "units": 10
}
```

Requirements:

- `userId` must identify a user belonging to the authenticated account.
- `requestId` must be nonblank and at most 128 characters.
- `units` must be a positive integer no greater than `2147483647`.

Both accepted consumption and quota-based rejection return HTTP `200`. Check the response's `accepted` field.

The result contains:

- Request ID, user ID, and requested units.
- UTC month and processing timestamp.
- Account and user usage snapshots.
- `accepted`.
- `rejection`, which is `null` for accepted requests.

For rejected consumption, the rejection describes the scope, violated rule, limit, and usage before the request.

A rejected request consumes no units.

### Idempotent retries

Retry the same request using the same `requestId`, `userId`, and `units`.

The service returns the original persisted result without consuming units again.

Reusing the same request ID with a different user or unit count conflicts with the original request. Request IDs are scoped to the authenticated account.

Accepted and quota-rejected results are both retained. A plan upgrade does not change a previously rejected request's result: submit a new request ID for a new decision.

Replay responses contain the original usage snapshot. Query the usage endpoints to retrieve current balances.

### Custom plans and plan changes

Create an owned custom plan with `POST /plans`:

```json
{
  "name": "Custom account plan",
  "scope": "account",
  "rules": {
    "monthlyAllowance": 500,
    "maxUnitsPerRequest": 50
  }
}
```

Assign an account plan with `PUT /accounts/me/plan`:

```json
{
  "planId": "<account-plan-id>"
}
```

Assign a user plan with `PUT /users/:userId/plan` using the same body shape and a user-scoped plan.

Update an owned custom plan with `PUT /plans/:planId`:

```json
{
  "name": "Updated account plan",
  "expectedVersion": 1,
  "rules": {
    "monthlyAllowance": 1000,
    "maxUnitsPerRequest": 100
  }
}
```

Use the plan's current version as `expectedVersion`. A stale version returns a conflict.

Updating a shared custom plan affects accounts or users assigned to that plan. Switching an assignment changes only the selected account or user.

Neither operation resets consumed units or rewrites existing request results.

### Usage and history

Omitting `month` selects the current UTC month.

```text
GET /usage/account?month=2026-10
GET /usage/users/<user-id>?month=2026-10
GET /usage/history?month=2026-10&page=1&pageSize=20
GET /usage/history?month=2026-10&userId=<user-id>&page=1&pageSize=20
```

Month query parameters use `YYYY-MM`. Response month values use `YYYY-MM-01`.

History:

- Includes accepted and quota-rejected requests.
- Belongs only to the authenticated account.
- Supports combined month and user filters.
- Defaults to page `1` and page size `20`.
- Allows page sizes up to `100`.
- Orders results by `processedAt` descending, with a secondary ID ordering.
- Returns pagination metadata, including total items and total pages.

Authentication and validation failures are not stored as consumption decisions.

## Design and consistency

### Application structure

- Routes and controllers handle HTTP requests.
- Validation checks request bodies and query parameters.
- Services implement account, plan, consumption, and usage behavior.
- TypeORM entities and migrations define PostgreSQL persistence.
- Composition constructs services using an injected data source.
- Quota evaluation uses separate rule evaluators for per-request and monthly limits.

Database schema synchronization is disabled. Schema changes are applied through migrations.

### Atomic consumption

A consumption transaction locks the account and user rows, checks for an existing request, reads the applicable plans, and evaluates both quota levels.

If accepted, it updates both monthly usage totals and stores the result in the same transaction.

If rejected, it stores the rejection without changing either usage total.

This prevents partial deductions where only one quota level is charged.

### Concurrency

Pessimistic write locks serialize competing consumption requests for the same account. This protects the shared account balance even when requests target different users.

Plan reads use locks within the consumption transaction. Plan updates also use version checks to detect stale edits.

The account lock is a deliberate correctness tradeoff: a heavily used single account can become a throughput bottleneck.

### Rule evaluation order

Rules are evaluated in this order:

1. Account per-request limit.
2. User per-request limit.
3. Account monthly allowance.
4. User monthly allowance.

The first violated rule determines the rejection reason.

### Monthly boundaries and plan changes

Monthly buckets use UTC. A new month uses a separate usage record; a scheduled reset job is not required.

Changing plans preserves recorded consumption. If the new allowance is below consumption, the remaining balance is reported as zero.

Historical usage queries return the selected month's consumed units but calculate allowance and remaining units from the currently assigned plan.

Stored consumption results preserve the original decision and usage snapshot. They are not recalculated after plan changes.

### Account isolation

The API key identifies the account; clients do not select another account by supplying an account ID.

User lookups and history queries are scoped to the authenticated account. API keys are stored as hashes, and ordinary account responses do not expose credentials.

## Automated tests

Start the dedicated test database:

```sh
docker compose -f compose.test.yml up -d --wait
```

Run type checking and all automated tests:

```sh
npm run typecheck
npm run test:all
```

The current suite contains:

| Suite | Tests |
| --- | ---: |
| Unit | 17 |
| Integration | 27 |
| Total | 44 |

Coverage includes:

- Consumption validation and quota rules.
- Database migrations and predefined seeds.
- API-key authentication and account isolation.
- Atomic balance updates and persisted decisions.
- Accepted and rejected request replay.
- Conflicting request IDs.
- Concurrent account/user quota enforcement.
- Concurrent retries without double counting.
- Plan changes preserving usage and history.
- Historical usage, filters, and pagination.

The integration suite uses PostgreSQL on `127.0.0.1:5434` with database `usage_metering_test`. It starts its own HTTP test server and does not require the Docker API to be running.

The test database is separate from the development database and uses temporary storage.

Individual commands:

```sh
npm run test:unit
npm run test:integration
```

`npm test` runs unit tests only.

Stop the test database:

```sh
docker compose -f compose.test.yml down
```

If integration tests report `ECONNREFUSED 127.0.0.1:5434`, start the test database before rerunning them.

## Load tests

Start the API:

```sh
docker compose up -d --build --wait api
```

Run the load scripts:

```sh
npx ts-node tests/load/consumption.load.ts
npx ts-node tests/load/contention.load.ts
```

These scripts create test accounts and data in the target API's database.

The recorded baseline completed 2,000 measured requests using 20 workers:

| Metric | Recorded value |
| --- | ---: |
| Successful requests | 2000 |
| Failed requests | 0 |
| Throughput | 208.24 requests/second |
| P95 latency | 110.80 ms |
| P99 latency | 125.61 ms |

Additional contention scenarios verified:

- Shared account quota enforcement.
- Individual user quota enforcement.
- Concurrent retries consuming once per unique request.

Expected quota rejections are valid business results, not failed attempts.

These measurements describe the recorded local environment and workload. They are not a production capacity guarantee.

See [load-test methodology, results, and limitations](tests/load/README.md) and the [saved JSON reports](tests/load/results/).

## Scope and limitations

- Document processing is simulated; external work is not part of the database transaction.
- There is no refund or reservation workflow for failed external processing.
- Account creation is an unauthenticated bootstrap endpoint.
- API-key rotation, revocation, and rate limiting are not implemented.
- Compose credentials are intended for local development.
- Consumption history and idempotency records have no automatic retention policy.
- Historical usage responses do not reconstruct past plan allowances.
- Load tests cover the documented local scenarios, not multi-instance deployment or every production workload.

Production deployment would need separate decisions for credentials, TLS, onboarding controls, retention, monitoring, and operational capacity.
## Metering Studio Dashboard

A web-based dashboard for managing accounts, users,
quota plans, consumption requests, and usage history.

Dashboard URL:
http://localhost:3000/dashboard/

Features:
- Account and user quota inspection
- Effective per-request quota limits
- Accepted and rejected consumption requests
- Idempotent request replay
- Custom plan management
- Usage history and pagination

## Automated Tests

The project includes 57 automated tests:

- 23 Unit Tests
- 34 Integration Tests

Run the tests:

npm run test:unit
npm run test:integration

Integration tests require the PostgreSQL test container.

## Additional API Endpoints

GET /accounts/me/plan
GET /users/:userId

These endpoints expose active plan information.

## Example Client

Run the demonstration client:

docker compose run --rm example-client
