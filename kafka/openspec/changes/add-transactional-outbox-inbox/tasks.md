# Tasks

## 1. Agent and Build Foundation

- [ ] 1.1 Create root `AGENTS.md` plus focused `.codex/` guides for supported commands, architecture, strict TDD, OpenSpec, and Kafka/Schema Registry/Avro; verify every documented path and command against the repository.
- [ ] 1.2 Enrich `openspec/config.yaml` with concise project context and artifact/apply rules, then verify `openspec context --json` and strict change validation succeed.
- [ ] 1.3 Convert the root POM to an executable Spring Boot JAR with the minimum Boot, PostgreSQL/Flyway, Kafka/Avro, code-generation, and test dependencies; verify Java 25 compilation and dependency resolution with `mvn -DskipTests package`.

## 2. Avro Contracts and Local Infrastructure

- [ ] 2.1 RED: add tests for generated key/value round-trips and backward-transitive evolution; GREEN: add versioned `.avsc` key/value schemas and Avro Maven generation; REFACTOR: remove any duplicate event model and verify the focused contract tests pass.
- [ ] 2.2 RED: add an automated Compose/configuration test for PostgreSQL, Schema Registry, topic initialization, partitions, replication, and min ISR; GREEN: extend `compose.yml` with pinned compatible services and health checks; verify `docker compose config --quiet` passes.
- [ ] 2.3 RED: add a Schema Registry integration test that separately registers/serializes the key and value with `TopicRecordNameStrategy`; GREEN: add producer/consumer Avro configuration and compatibility settings; verify expected subjects and rejection of an incompatible value schema.

## 3. Persistence and Atomic Order Creation

- [ ] 3.1 RED: add PostgreSQL repository tests for order, item, outbox, inbox, and projection tables, unique event IDs, statuses, and diagnostic fields; GREEN: add Flyway migrations, entities, enums, and repositories; verify the focused Testcontainers suite passes.
- [ ] 3.2 RED: add service integration tests proving a valid order and one pending Avro outbox row commit atomically and an injected post-order failure leaves neither durable; GREEN: implement the transactional order use case, Avro mapper/codec, and rollback test seam; REFACTOR and rerun the focused suite.

## 4. REST API

- [ ] 4.1 RED: add service/unit tests for request mapping and created response values; GREEN: add DTOs, mapper, service boundary, and domain exceptions without exposing entities; verify the unit tests pass.
- [ ] 4.2 RED: add MVC tests for HTTP 201, invalid customer/items/quantities, mapped domain errors, and sanitized HTTP 500; GREEN: add the controller and centralized advice; REFACTOR and verify the MVC slice passes.

## 5. Transactional Outbox Publisher

- [ ] 5.1 RED: add unit tests for outbox state transitions, stable event IDs, bounded exponential backoff, diagnostic sanitization, and terminal/requeue behavior; GREEN: implement the state policy; verify focused unit tests pass.
- [ ] 5.2 RED: add PostgreSQL concurrency tests for `SKIP LOCKED`, owner-checked completion, and expired-lease recovery; GREEN: implement the native claim/update repository and transactional claim service; verify two concurrent claimers cannot own the same healthy lease.
- [ ] 5.3 RED: add publisher tests for Avro key/value send, acknowledgement-to-`PUBLISHED`, retry-to-`RETRY`, exhaustion-to-`FAILED`, and the acknowledgement/status duplicate window; GREEN: implement the scheduled publisher and Kafka adapter; verify focused publisher tests pass.
- [ ] 5.4 RED: add a Kafka/Schema Registry integration test that consumes the publisher's generated Avro key/value; GREEN: complete topic and serializer wiring; verify no JSON serializer or JSON payload is used in production or Kafka tests.

## 6. Transactional Inbox Consumer

- [ ] 6.1 RED: add unit tests for new, processed-duplicate, retryable-failure, terminal-failure, and explicit-requeue decisions; GREEN: implement inbox policy and failure classification; verify focused unit tests pass.
- [ ] 6.2 RED: add PostgreSQL integration tests proving inbox `PROCESSED` plus one projection commit together, rollback leaves no partial effect, and sequential/concurrent duplicates create exactly one effect; GREEN: implement transactional processing and duplicate handling; verify the focused suite passes.
- [ ] 6.3 RED: add integration tests proving failure details persist in a separate transaction, bounded redelivery can recover, exhausted attempts remain terminal `FAILED`, and explicit requeue can later succeed; GREEN: implement failure recording, error-handler backoff, recovery, and maintenance requeue service; verify the focused suite passes.
- [ ] 6.4 RED: add an end-to-end Kafka integration test covering publish, consume, offset-safe success, forced redelivery, and stable event-ID idempotency with real Avro serializers and Schema Registry; GREEN: complete listener/container configuration; verify the end-to-end test passes.

## 7. Verification and Documentation

- [ ] 7.1 Document REST examples, local startup, schema evolution, retry/requeue operations, transaction boundaries, at-least-once guarantees, and the exact duplicate window; verify examples and links against the implemented application.
- [ ] 7.2 Run focused tests after each prior slice, then run `mvn clean verify`, strict OpenSpec validation, `docker compose config --quiet`, and the documented full-stack smoke test when Docker is available; record any environmental limitation with the exact failing command.
- [ ] 7.3 Review package separation, generated-source boundaries, dependency necessity, secrets/diagnostic hygiene, and `git diff --check`; reconcile docs/tasks with the final code and verify the working tree contains no accidental artifacts.
