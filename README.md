# Usage Metering & Quota Service

A backend service built with **Node.js, TypeScript, Express, TypeORM, and PostgreSQL** to track API usage and enforce monthly quotas at both account and user levels.

The service allows applications to manage quota plans, consume units, inspect usage, and retrieve historical consumption decisions.

It is designed around transactional consistency, concurrency safety, idempotency, account isolation, and configurable quota rules.

## Key Features

- Account registration with generated API keys
- Account-level and user-level quotas
- Predefined and account-owned custom plans
- Monthly allowances and per-request limits
- Atomic consumption using PostgreSQL transactions
- Concurrency protection using pessimistic locking
- Idempotent request processing
- Plan assignment and updates without redeployment
- Account isolation and API-key authentication
- Monthly usage tracking and paginated history
- Browser-based Metering Studio dashboard
- Automated unit and integration testing
- Load testing with recorded performance results
- Docker Compose for the complete application stack
- GitHub Actions for Continuous Integration

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript |
| Framework | Express.js |
| Database | PostgreSQL 17 |
| ORM | TypeORM |
| Authentication | API Keys |
| Transactions | PostgreSQL Transactions |
| Concurrency | Pessimistic Row Locking |
| Frontend | HTML, CSS, JavaScript |
| Containers | Docker & Docker Compose |
| Testing | Node.js Test Runner |
| CI | GitHub Actions |

## Architecture

The service separates HTTP handling, business logic, validation, and persistence.

```text
Client / Metering Studio
          |
          v
      Express API
          |
          v
   API Key Middleware
          |
          v
       Routes
          |
          v
     Controllers
          |
          v
       Services
          |
          v
 Quota Rule Evaluation
          |
          v
 PostgreSQL Transactions
          |
          v
      PostgreSQL
```

### Main Components

**Account Service**

Responsible for account creation, API-key issuance, account plan assignment, and active plan inspection.

**User Service**

Handles user registration, account ownership, user plan assignment, and active user plan inspection.

**Plan Service**

Manages predefined and custom plans, including plan creation, updates, ownership validation, and version checks.

**Consumption Service**

Processes quota consumption requests, enforces account and user rules, handles idempotency, and records accepted or rejected decisions.

**Usage Service**

Returns account and user consumption statistics for a selected UTC month.

**Usage History Service**

Provides account-scoped, filtered, and paginated historical consumption decisions.

## Getting Started

### Requirements

- Docker Engine or Docker Desktop
- Docker Compose v2

Node.js is not required locally when using the Docker workflow.

### Run the Complete Application

```bash
docker compose up --build
```

Docker Compose starts:

1. PostgreSQL
2. The backend API
3. The example client

The API initializes the database, applies migrations, and seeds predefined plans before serving requests.

### Application URLs

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Health Check | http://localhost:3000/health |
| Metering Studio | http://localhost:3000/dashboard/ |
| PostgreSQL | localhost:5433 |

The example client runs after the API becomes healthy.

### Run the Example Client Again

```bash
docker compose run --rm example-client
```

### View Example Client Logs

```bash
docker compose logs example-client
```

### Stop the Application

```bash
docker compose down
```

The PostgreSQL named volume preserves application data across normal container restarts.

## Metering Studio Dashboard

Metering Studio is a browser-based interface served by the existing Express application.

Open:

**http://localhost:3000/dashboard/**

### Dashboard Features

- Account usage overview
- Current account and user plans
- Effective per-request quota limits
- User registration and plan assignment
- Custom plan creation and modification
- Consumption requests
- Accepted and rejected decision details
- Idempotent request replay
- Monthly usage history and pagination

The dashboard supports creating a demo workspace or connecting to an existing account using its API key.

API keys are retained in browser memory during the active session rather than stored in browser storage.

The dashboard is intended for local demonstration and development. It is not a production-ready administration portal.

## Accounts, Users, and Plans

### Account

An account represents an application or company using the metering service.

Each account has a shared monthly allowance covering all its users.

### User

A user belongs to exactly one account.

Each user has individual quota limits. Different users may share the same plan while maintaining separate consumption balances.

### Plan

A plan defines configurable quota rules.

Each account has an account-scoped plan, while each user has a user-scoped plan.

Both plans are evaluated for every consumption request.

### Predefined Plans

| Plan | Scope | Monthly Allowance | Max Units/Request |
|---|---|---:|---:|
| Starter | Account | 10,000 | 100 |
| Pro | Account | 100,000 | 1,000 |
| Basic | User | 1,000 | 20 |
| Premium | User | 10,000 | 200 |

Predefined plans are automatically seeded and are read-only.

Accounts can create and manage their own custom plans.

## Quota Rules

The service supports two quota rules at both account and user levels.

### Monthly Allowance

Defines the maximum number of units that can be consumed during a UTC calendar month.

### Maximum Units Per Request

Defines the maximum units allowed in a single consumption request.

### Rule Evaluation Order

1. Account maximum units per request
2. User maximum units per request
3. Account monthly allowance
4. User monthly allowance

The first violated rule determines the rejection reason.

### Example

Suppose:

- Starter Account: maximum 100 units/request
- Premium User: maximum 200 units/request

A request for 199 units is rejected because the **account limit is 100**, even though the Premium user allows 200.

The effective request limit is the more restrictive applicable limit.

A request succeeds only when both account and user limits allow it.

### Atomic Consumption

Accepted requests:

- Increase the user's consumed units
- Increase the account's shared consumed units
- Store the accepted result

Rejected requests:

- Consume zero units
- Preserve existing usage balances
- Store the rejection and its reason

Both account and user balance updates occur in the same PostgreSQL transaction.

## API Documentation

All account-specific endpoints require:

```http
x-api-key: <account-api-key>
```

Account creation and the health endpoint do not require an API key.

### Available Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | API and database health |
| POST | `/accounts` | Create account and issue API key |
| GET | `/accounts/me` | Get authenticated account |
| GET | `/accounts/me/plan` | Inspect active account plan |
| PUT | `/accounts/me/plan` | Change account plan |
| GET | `/users` | List account users with pagination |
| POST | `/users` | Create a user |
| GET | `/users/:userId` | Inspect user and active plan |
| PUT | `/users/:userId/plan` | Assign user plan |
| GET | `/plans` | List available plans |
| POST | `/plans` | Create custom plan |
| PUT | `/plans/:planId` | Update owned custom plan |
| POST | `/consumption` | Consume units or replay request |
| GET | `/usage/account` | Get monthly account usage |
| GET | `/usage/users/:userId` | Get monthly user usage |
| GET | `/usage/history` | Get filtered, paginated history |

### Create an Account

```http
POST /accounts
Content-Type: application/json
```

```json
{
  "name": "Example Company",
  "planId": "00000000-0000-4000-8000-000000000001"
}
```

The response contains the created account and a generated API key.

The API key should be stored securely by the calling application.

### Create a User

```http
POST /users
x-api-key: <account-api-key>
Content-Type: application/json
```

```json
{
  "externalId": "user-001",
  "planId": "00000000-0000-4000-8000-000000000003"
}
```

### Consume Units

```http
POST /consumption
x-api-key: <account-api-key>
Content-Type: application/json
```

```json
{
  "userId": "<user-id>",
  "requestId": "request-001",
  "units": 10
}
```

The result includes:

- Request identifier
- User identifier
- Requested units
- UTC month and processing timestamp
- Accepted or rejected status
- Account usage and remaining allowance
- User usage and remaining allowance
- Rejection reason when applicable

Quota decisions return HTTP 200 with an `accepted` field indicating the outcome.

Validation, authentication, and request conflicts use appropriate HTTP error responses.

## Idempotency

Every consumption request includes a `requestId`.

A request can be safely retried using the same:

- Request ID
- User ID
- Units

The service returns the original persisted result without consuming units again.

Reusing a request ID with different request data produces a conflict.

Idempotency is scoped to the authenticated account.

Both accepted and quota-rejected decisions are preserved.

If a previously rejected request should be evaluated again after a plan change, the caller must submit a new request ID.

## Concurrency and Transaction Safety

Concurrent consumption requests can target the same user or different users sharing one account allowance.

Without proper synchronization, concurrent requests could consume more units than allowed.

### Implementation

The service uses PostgreSQL transactions and pessimistic row locking.

A consumption transaction locks the relevant account and user records before evaluating and applying quota changes.

This protects shared account allowances from race conditions and prevents partial consumption updates.

### Design Trade-off

Account-level locking prioritizes accounting correctness.

However, concurrent requests targeting the same account may wait for one another, creating a potential throughput bottleneck under heavy contention.

This behavior is documented and covered by concurrency tests.

## Custom Plans and Plan Updates

Accounts can create custom account-scoped and user-scoped plans.

Custom plans support:

- Monthly allowance
- Maximum units per request
- Plan name
- Version tracking

Plans can be updated without redeploying or restarting the service.

### Optimistic Version Checks

Custom plan updates use an `expectedVersion` value.

If the submitted version is outdated, the update is rejected with a version conflict.

### Plan Change Behavior

- Existing consumed units remain unchanged
- New limits apply to subsequent consumption decisions
- Historical consumption decisions remain preserved
- Lowering an allowance below current usage results in zero remaining units
- Switching plans does not reset usage

Plan limits are validated against PostgreSQL integer storage boundaries.

## Monthly Usage and History

Usage is tracked using UTC calendar months.

A new month uses a new monthly usage record, so no scheduled reset job is required.

Previously recorded usage remains available.

### Account Usage

```http
GET /usage/account?month=2026-10
```

### User Usage

```http
GET /usage/users/<user-id>?month=2026-10
```

### Consumption History

```http
GET /usage/history?month=2026-10&page=1&pageSize=20
```

History supports:

- Filtering by UTC month
- Filtering by user
- Pagination
- Accepted and rejected decisions
- Processing timestamps
- Account isolation

Page size is limited to a maximum of 100 records.

Historical consumed units are preserved. Available allowance is calculated using the currently assigned plan rather than reconstructing historical plan assignments.

## Account Isolation and API Security

Every API key identifies one account.

The backend derives account identity from the API key rather than trusting an account ID supplied by the caller.

Security-related behaviors include:

- Missing or invalid API keys are rejected
- API keys are generated using cryptographically secure random bytes
- API-key hashes are stored in PostgreSQL
- User access is restricted to the authenticated account
- Plan ownership is validated
- Usage and history queries are account-scoped
- API keys are not returned by ordinary account inspection endpoints

Production account provisioning, credential rotation, and operational security hardening are documented as future improvements.

## Example Client

The repository contains a working CLI client that simulates document processing.

It demonstrates users sharing one account but having different individual quotas.

### Demo Scenario

| Action | Expected Result |
|---|---|
| Alice consumes 10 units | Accepted |
| Alice submits another request | Rejected by user monthly allowance |
| Bob consumes 20 units | Accepted |
| Bob submits another request | Rejected by shared account allowance |
| Account allowance changes from 30 to 50 | Plan update succeeds |
| Bob consumes another unit | Accepted |

### Final Usage

| Owner | Consumed | Remaining |
|---|---:|---:|
| Account | 31 | 19 |
| Alice | 10 | 0 |
| Bob | 21 | 79 |

Run:

```bash
docker compose run --rm example-client
```

The document processing action is simulated. Actual document uploads and processing are outside the project scope.

## Automated Testing

The project contains **57 automated tests**.

| Test Suite | Tests |
|---|---:|
| Unit Tests | 23 |
| Integration Tests | 34 |
| **Total** | **57** |

### Test Coverage

- Input and quota rule validation
- API-key authentication
- Account isolation
- Database migrations and predefined plans
- Account and user quota enforcement
- Atomic usage updates
- Concurrent consumption requests
- Shared account allowance protection
- Idempotent request retries
- Request ID conflicts
- Accepted and rejected decision persistence
- Plan assignment and updates
- Plan version checks
- Plan inspection endpoints
- PostgreSQL integer boundary validation
- Historical usage and pagination
- User directory authentication and isolation

### Start the Test Database

```bash
docker compose -f compose.test.yml up -d --wait
```

### Run Unit Tests

```bash
npm run test:unit
```

### Run Integration Tests

```bash
npm run test:integration
```

### Run All Tests

```bash
npm run test:all
```

### Run TypeScript Type Checking

```bash
npm run typecheck
```

Integration tests use a dedicated PostgreSQL test database separate from the application database.

## Performance and Load Testing

Load tests evaluate throughput, latency, concurrency behavior, and quota correctness.

The load-testing scripts and recorded reports are available under:

`tests/load/`

### Recorded Baseline

Test configuration:

- 2,000 measured requests
- 20 concurrent workers
- 10 users
- PostgreSQL 17
- One Node.js API instance
- Local Docker environment

### Results

| Metric | Result |
|---|---:|
| Measured Requests | 2,000 |
| Successful Requests | 2,000 |
| Unexpected Failures | 0 |
| Throughput | 208.24 requests/sec |
| P50 Latency | 93.53 ms |
| P95 Latency | 110.80 ms |
| P99 Latency | 125.61 ms |

### Additional Load Scenarios

The project also tests:

- Shared account quota contention
- Individual user quota contention
- Concurrent idempotent request retries

These scenarios verified correct usage totals and expected rejection outcomes under the recorded workloads.

### Reproduce Load Tests

Start the backend:

```bash
docker compose up -d --build --wait api
```

Run the baseline:

```bash
npx ts-node tests/load/consumption.load.ts
```

Run contention scenarios:

```bash
npx ts-node tests/load/contention.load.ts
```

See [Load Testing Documentation](tests/load/README.md) for the full methodology, raw results, configuration, and limitations.

The measurements describe a local test environment and should not be interpreted as production capacity guarantees.

## Continuous Integration

The project uses GitHub Actions for Continuous Integration.

Workflow file:

`.github/workflows/ci.yml`

The CI pipeline runs on pushes and pull requests targeting `main` or `develop`.

### CI Pipeline

1. Check out the repository
2. Configure Node.js 24
3. Install dependencies
4. Run TypeScript type checking
5. Start the isolated PostgreSQL test database
6. Execute automated unit and integration tests
7. Build and start the application with Docker Compose
8. Execute the working example client
9. Clean up containers and test resources

The pipeline provides automated verification before code changes are merged.

**Note:** The project implements CI, not automated production deployment (CD).

## Engineering Decisions and Trade-offs

### Transactional Consistency

Account and user usage updates are executed atomically to avoid partial deductions.

### Pessimistic Concurrency Control

Database row locking protects shared quota balances, prioritizing correctness over maximum throughput for a single highly active account.

### Idempotency

Persisted consumption decisions protect against double charging when clients retry requests.

### Configurable Plans

Plan definitions are stored in PostgreSQL, allowing rule changes without redeployment.

### Monthly Usage Records

Usage is stored by UTC month rather than reset using scheduled jobs.

### Account Isolation

API-key authentication determines ownership, and queries enforce account boundaries.

### Scope Management

The project prioritizes a reliable, tested core implementation over additional infrastructure and operational features outside the assignment requirements.

## Known Limitations

- Public account creation is intended for the local demonstration workflow and is not hardened for production provisioning.
- Docker Compose credentials and exposed ports are configured for local development.
- API-key rotation and revocation are not implemented.
- History and idempotency records have no automatic retention policy.
- Historical queries do not reconstruct the plan limits that were assigned during a previous month.
- Document processing is simulated.
- Load tests were performed in a local, single-instance environment.
- The browser dashboard is a demonstration interface rather than a production administration portal.
- Advanced monitoring, production secrets management, and distributed deployment are not implemented.

## Future Improvements

The following enhancements were identified for a production-oriented version of the service but were intentionally left outside the completed scope.

### 1. Production Security and Provisioning

- Protect public account creation with a controlled provisioning workflow.
- Move deployment credentials into secure environment or secret management.
- Restrict exposed ports and enforce appropriate network boundaries.
- Introduce API-key rotation, revocation, and rate limiting.

### 2. Database Query Optimization

- Analyze history queries using `EXPLAIN ANALYZE`.
- Improve indexing for month filtering and processing-time ordering.
- Evaluate indexed columns or expression indexes instead of relying only on JSONB-based history queries.

### 3. Advanced Concurrency Testing

- Test behavior at UTC month boundaries.
- Test plan updates occurring concurrently with consumption requests.
- Verify competing plan updates using the same expected version.

### 4. Multi-instance API Testing

- Run multiple API instances against a shared PostgreSQL database.
- Verify that transactions, locking, and idempotency remain correct across independent application instances.
- Measure contention and database connection usage.

### 5. Observability and Maintainability

- Introduce structured application logging.
- Add correlation/request IDs across API operations.
- Measure database transaction and lock-wait latency.
- Improve naming and formatting consistency.
- Refactor large frontend modules into smaller maintainable components.

### 6. Documentation and Operational Readiness

- Expand production deployment documentation.
- Document operational monitoring and recovery procedures.
- Extend performance testing to long-running and distributed workloads.

These improvements represent potential future engineering work, not functionality claimed to be implemented.

## Project Scope

This project focuses on usage metering, quota decisions, and the reliability of those operations.

Billing, payments, refunds, multi-resource billing, end-user authentication, role-based administration, and distributed infrastructure are outside the required scope.

## Final Summary

The Usage Metering & Quota Service demonstrates:

- Backend API development with TypeScript and PostgreSQL
- Transactional data consistency
- Concurrent request handling
- Idempotent consumption processing
- Configurable business rules
- Account-level data isolation
- Automated and integration testing
- Performance measurement
- Docker-based application delivery
- Continuous Integration with GitHub Actions

The implementation emphasizes correctness, testability, and documented engineering trade-offs while keeping future production improvements clearly separated from the completed project.
