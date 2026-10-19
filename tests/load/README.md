# Load Testing

These tests measure consumption API performance and verify accounting
correctness under concurrent requests.

They use TypeScript, Node.js fetch, and node:assert. No additional load-testing
dependency is required.

## Prerequisites

- Docker Engine with Docker Compose.
- Node.js 24 and npm.
- Project dependencies installed with `npm ci`.
- Run all commands from the repository root.

The API and PostgreSQL run in Docker. The load generator runs on the host.

## Run the tests

Start the API and its database:

```bash
docker compose up -d --build --wait api
```

Run the baseline:

```bash
npx ts-node tests/load/consumption.load.ts
```

Run the contention and retry scenarios:

```bash
npx ts-node tests/load/contention.load.ts
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if required by your
execution policy.

Each script writes a JSON report to `tests/load/results/`.
A successful run exits with code 0. Setup, request, or verification failures
cause a nonzero exit code.

## Data isolation

Each run creates fresh accounts, custom plans, and users through the API.
The contention script creates a separate account for each scenario.

The scripts use the database behind `API_BASE_URL`, which defaults to
`http://localhost:3000`. They do not use the integration-test database
automatically.

Run them against a local development or dedicated load-testing environment.
Generated data remains available for inspection after the run.
The scripts do not delete existing data and do not write API keys to reports.

## Load model and measurement

Both scripts use a closed-loop model with a fixed number of asynchronous
workers. Each worker waits for its current request to finish before sending
the next one.

Concurrency means the maximum number of outstanding client operations.
It is not a requests-per-second target, a thread count, or a count of
simultaneously executing database transactions.

Each consumption request consumes one unit if accepted.

Account, plan, and user setup is excluded from the measured duration.
Post-run usage and history verification is also excluded.

Latency is measured by the client around each consumption operation,
including HTTP communication, response parsing, and response assertions.
Failed attempts are included in the latency samples.

Throughput is completed attempts divided by measured elapsed time.
It includes expected quota rejections and repeated requests.

P50, P95, and P99 are nearest-rank latency percentiles.
For example, P95 is the latency at or below which approximately 95% of
measured attempts completed.

## Baseline scenario

File: `consumption.load.ts`

Default configuration:

- One account.
- Ten users.
- 2,000 measured requests with unique request IDs.
- Twenty concurrent workers.
- Fifty warm-up requests, excluded from performance measurements.
- Sufficient account and user allowances to accept every request.

The warm-up consumes real units. Expected final account usage is therefore
2,050 units under the default configuration.

The script verifies:

- Every measured request is accepted.
- Returned request IDs, user IDs, units, and month match expectations.
- Account usage matches accepted consumption.
- Each user's usage matches that user's accepted consumption.
- Remaining allowances are correct.
- History contains all warm-up and measured requests.

### Configuration

The baseline supports these environment variables:

| Variable | Default | Allowed values |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:3000` | Target API URL |
| `LOAD_REQUESTS` | 2000 | Integer from 1 to 100000 |
| `LOAD_CONCURRENCY` | 20 | Integer from 1 to 500 |
| `LOAD_USERS` | 10 | Integer from 1 to 100 |

Example in PowerShell:

```powershell
$env:LOAD_REQUESTS = "5000"
$env:LOAD_CONCURRENCY = "50"
$env:LOAD_USERS = "10"

npx.cmd ts-node tests/load/consumption.load.ts

Remove-Item Env:LOAD_REQUESTS
Remove-Item Env:LOAD_CONCURRENCY
Remove-Item Env:LOAD_USERS
```

These settings provide additional experiments; they were not used for the
recorded baseline below.

## Contention and retry scenarios

File: `contention.load.ts`

Each scenario uses ten users and fifty concurrent workers.
There is no explicit warm-up phase.
Scenarios run sequentially, each with its own fresh account.

Only `API_BASE_URL` is configurable through the environment for this script.
Scenario sizes and concurrency are defined in the source.

### Shared account quota

- Account monthly allowance: 250 units.
- Each user's monthly allowance: 1,000 units.
- 1,000 distinct requests.

Expected outcome: 250 accepted requests and 750 account monthly-allowance
rejections. Final account usage must be exactly 250.

### Individual user quotas

- Account monthly allowance: 2,000 units.
- Each user's monthly allowance: 25 units.
- 1,000 distinct requests distributed equally across ten users.

Expected outcome: 250 accepted requests and 750 user monthly-allowance
rejections. Each user must consume exactly 25 units.

### Concurrent idempotent retries

- Account and user monthly allowances: 1,000 units.
- 100 distinct request payloads.
- Each payload is sent ten times using the same request ID.
- Repeated attempts are scheduled next to each other to create overlap.

Expected outcome: 1,000 accepted responses but only 100 unique accepted
operations, 100 consumed units, and 100 history records.

Repeated responses must match the original result, including its original
usage snapshot and processing timestamp.

### Post-run verification

For each scenario, the script checks:

- Expected accepted and rejected response counts.
- Expected rejection scope and rule.
- Account usage and remaining allowance.
- Usage and remaining allowance for every user.
- History record count.
- Every stored result against the corresponding returned result.
- Absence of duplicate request IDs across history pages.

Expected business rejections are successful decisions, not failed attempts.
HTTP errors, transport errors, and failed response assertions count as
failed attempts.

The scripts also detect a UTC month boundary during execution and fail
verification rather than treating mixed-month usage as a valid result.

## Recorded results

Recorded on 2026-10-19.

Environment:

- Load generator: Node.js v24.21.0, Windows x64.
- Target: `http://localhost:3000`.
- API: compiled JavaScript in the project's Node.js Docker image.
- Database: PostgreSQL 17 in Docker.
- One API instance and one database instance.
- Load generator and Docker stack on the same host.

Docker resource allocations, CPU utilization, and database lock-wait
measurements were not captured in these reports.

### Performance

| Scenario | Attempts | Workers | Duration (s) | Attempts/s | P50 (ms) | P95 (ms) | P99 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 2000 | 20 | 9.60 | 208.24 | 93.53 | 110.80 | 125.61 |
| Shared account quota | 1000 | 50 | 4.36 | 229.21 | 203.29 | 279.46 | 356.19 |
| Individual user quotas | 1000 | 50 | 4.17 | 239.92 | 199.58 | 249.58 | 256.55 |
| Idempotent retries | 1000 | 50 | 2.06 | 484.58 | 99.89 | 131.88 | 146.71 |

Baseline mean latency was 95.52 ms; maximum latency was 150.80 ms.
Throughput uses unrounded elapsed time, so dividing by the displayed rounded
duration may produce a slightly different value.

### Correctness

| Scenario | Accepted responses | Expected rejections | Unexpected failures | Unique accepted operations |
| --- | ---: | ---: | ---: | ---: |
| Baseline, excluding warm-up | 2000 | 0 | 0 | 2000 |
| Shared account quota | 250 | 750 | 0 | 250 |
| Individual user quotas | 250 | 750 | 0 | 250 |
| Idempotent retries | 1000 | 0 | 0 | 100 |

All post-run verification checks passed.

Raw reports:

- [Baseline report](results/consumption-078e0266-a41f-4548-b211-aaea231705ae.json)
- [Contention and retry report](results/contention-2bc1b5f2-89fd-4efe-a259-8d28e59de667.json)

## Interpretation and tradeoffs

The tested workloads preserved account and user totals under contention.
Expected rejections consumed no units, and concurrent repeated requests
did not create duplicate consumption or history records.

Consumption transactions acquire an account write lock before proceeding.
Requests for the same account therefore compete for that lock, including
requests for different users under that account.

This intentionally prioritizes correct shared-account accounting.
It also creates a potential bottleneck for a heavily used account.
Lock-wait time was not profiled, so these reports do not establish how much
of the measured latency was caused by that lock.

The retry scenario had higher measured throughput. Reusing an existing
result avoids the work required to record a new consumption decision.
This is consistent with the observed result, but the scenarios have
different workloads and do not constitute a controlled optimization
comparison.

No production performance optimization was introduced as part of these
tests. A next investigation would compare one busy account with several
independent accounts and measure database lock waits before changing
the locking strategy.

## Limitations

- These are short, single-run local measurements, not maximum-capacity claims.
- A closed-loop generator reduces its sending rate when responses slow down;
  it does not model a fixed external arrival rate.
- The generator and service share host resources.
- All measured scenarios concentrate traffic on one account at a time.
- Database transactions need not execute simultaneously just because
  client requests overlap.
- Baseline and contention scenarios differ in concurrency, warm-up, and
  workload; their throughput should not be compared as identical workloads.
- No long-duration soak test, multi-instance API test, network-failure
  injection, or concurrent plan-change load scenario is included.
- Passing these scenarios provides evidence for the tested conditions,
  not proof against every possible concurrency failure.
- Dependency locks improve reproducibility, but Docker image tags can move.
  Record image digests and resource limits for stricter future comparisons.
- Each run leaves additional records in the database. Database size and
  other host activity can affect subsequent measurements.