# Design

## Context

The repository currently contains a parent-style packaging POM and a six-node Apache Kafka 4.0.2 KRaft Compose topology. It has no application, database, Schema Registry, schemas, or tests. Java 25 and Spring Boot 4.1.1 are fixed constraints. See `proposal.md` for motivation and the five delta specs for observable behavior.

Spring Kafka 4.1.x uses the Kafka 4.x client line, and Kafka clients remain protocol-compatible with the required 4.0.2 brokers. Confluent Platform 8.0 is the matching Kafka 4.0 generation; the Schema Registry image and Avro serializer will therefore be pinned to the same 8.0.x release. Confluent documents `TopicRecordNameStrategy` as topic-and-fully-qualified-record scoped and compatibility as subject scoped, which fits a teaching topic that may gain new event record types.

## Goals / Non-Goals

**Goals:**

- Make every transactional boundary, retry transition, and duplicate window visible in code, schema, and tests.
- Keep one deployable application with strict MVC/package separation so learners can follow the full flow without distributed-service overhead.
- Exercise PostgreSQL, Kafka, and Schema Registry in integration tests while retaining fast unit and MVC slices.
- Make local development commands and agent conventions executable and maintainable.

**Non-Goals:**

- End-to-end exactly-once semantics, XA/two-phase commit, Kafka transactions spanning PostgreSQL, or Debezium CDC.
- Payment, delivery, authentication, restaurant catalog, pricing, inventory, or a public inbox-retry endpoint.
- A production operations platform; terminal failures are inspectable and requeued through an application maintenance service/test seam.

## Decisions

### 1. One Spring Boot application, one PostgreSQL database, separated adapters

The root project becomes an executable JAR. Packages follow `config`, `service`, `repository`, `entity`, `rest.api`, `rest.dto`, `rest.controller`, `rest.advice`, `exception`, `messaging.producer`, `messaging.consumer`, `outbox`, `inbox`, and `mapper`. Controllers accept/return DTOs only; services own use cases and transaction boundaries; repositories own persistence; Kafka adapters translate generated Avro records at the edge.

PostgreSQL is used locally and in repository tests because `FOR UPDATE SKIP LOCKED`, lease timestamps, uniqueness behavior, and transaction semantics are part of the feature. H2 is not used as a substitute for those integration checks. Flyway owns schema creation; Hibernate validates rather than creates tables.

Alternative considered: split producer and consumer into separate services/databases. That is closer to a real deployment but adds build and operations noise unrelated to the teaching objective. Separate tables and transaction services in one app preserve the pattern boundaries.

### 2. Atomic write with binary Avro payload in the outbox

Order creation builds a generated `OrderCreated` specific record, encodes it as raw Avro binary for the outbox `BYTEA` payload, and stores its full record name/schema version alongside the order in one `@Transactional` use case. The Confluent wire header is not stored because registry IDs are environment-specific; the publisher decodes the stable raw payload and lets `KafkaAvroSerializer` register/encode it for the target registry.

Alternative considered: store JSON or reconstruct the event from mutable order tables. JSON violates the messaging constraint; reconstruction can publish state different from the committed event. Database columns for every event field create unnecessary coupling. Binary Avro is immutable, inspectable with its checked-in writer schema, and faithful to the committed event.

### 3. Lease-based outbox claiming with bounded retries

A short database transaction selects a configurable batch using `FOR UPDATE SKIP LOCKED`, marks rows `PROCESSING`, sets `locked_by`/`locked_at`, and increments attempts. Kafka sends happen after the claim commits. Each acknowledged send changes its row to `PUBLISHED`; failure changes it to `RETRY` with sanitized diagnostics and an exponential schedule (default 1s, 5s, 30s; maximum three attempts for the sample). `PROCESSING` rows whose lease expired are eligible for reclaim. Terminal rows become `FAILED`; a maintenance service can explicitly requeue them.

This avoids holding database locks during broker I/O and allows multiple publisher instances. It deliberately permits duplicates if a process dies after broker acknowledgement and before the `PUBLISHED` update. The event ID never changes, so the inbox absorbs that window.

Alternative considered: hold a database row lock through synchronous Kafka acknowledgement. That is smaller code but couples database capacity to broker latency and still cannot remove the acknowledgement/status crash window without XA.

### 4. Inbox state machine and transaction choreography

`inbox_message.event_id` is the primary duplicate key. A delivery first attempts a transactional unit containing inbox transition to `PROCESSING`, insertion of an `order_projection` keyed by source event, and transition to `PROCESSED`. An existing `PROCESSED` row returns success without applying the effect. Kafka uses record acknowledgement after listener success, so a crash after database commit and before offset commit causes a harmless redelivery.

If processing throws, that transaction rolls back. A separate `REQUIRES_NEW` failure recorder upserts `FAILED`, increments the attempt counter, stores bounded diagnostics and the event payload, then the listener rethrows while attempts remain. Spring Kafka's error handler applies the configured bounded backoff. At the limit it recovers the record (commits past it) while leaving terminal `FAILED`. Explicit requeue clears terminal eligibility but preserves the event identifier and attempt history; a subsequent delivery repeats the normal path.

Alternative considered: catch the error and persist `FAILED` in the business transaction. That risks committing partial business writes. A separate failure transaction preserves atomic success semantics.

### 5. Avro contracts, subjects, and compatibility

`src/main/avro` contains `OrderEventKey.avsc` and `OrderCreated.avsc`; item data is a nested named record. The Avro Maven plugin generates Java during `generate-sources`, and no hand-written Kafka event POJO duplicates it. UUIDs and instants cross the contract as strings/epoch milliseconds to avoid runtime-specific logical-type surprises in the learning example.

Both serializers use `TopicRecordNameStrategy`. Subjects are therefore independently versioned for the topic plus fully qualified key/value record, supporting future event types without forcing unrelated records through one compatibility chain. Global Schema Registry compatibility is `BACKWARD_TRANSITIVE`; tests register a baseline fixture and the current schema in order, assert compatibility, and prove a required no-default field is rejected. Evolution permits additive defaulted fields and requires a new record name for breaking semantics.

Alternative considered: default `TopicNameStrategy`. It is simpler but forces every value record on the topic into one compatibility chain and makes adding a different event type pedagogically confusing.

### 6. Test layers and strict TDD slices

Each vertical slice begins with a failing acceptance/unit/integration test, adds the minimum implementation, then refactors under green tests. Unit tests cover mapping, state transitions, retry decisions, and service behavior. `@WebMvcTest` covers HTTP DTOs/advice. PostgreSQL Testcontainers tests atomic rollback, locks, constraints, and repository queries. Kafka plus Schema Registry containers test generated key/value serialization, publish/consume, redelivery, and idempotency; no Kafka test substitutes JSON. A fast Avro compatibility test runs without Docker, while a registry integration test verifies actual subject registration.

Compose itself is checked statically in the automated build where Docker is unavailable, with a documented opt-in smoke profile for starting the full six-node cluster, PostgreSQL, topic initializer, and Schema Registry.

## Risks / Trade-offs

- **[Confluent artifacts are outside Maven Central]** → Pin one 8.0.x version, declare only Confluent's official repository, and add dependency convergence/build checks.
- **[Java 25 support can expose lagging test libraries]** → Prefer Spring Boot-managed dependencies and current Testcontainers; compile and run the full suite on the repository's Java 25 runtime before completion.
- **[Six Kafka nodes plus containers are resource intensive]** → Keep normal integration tests on minimal reusable containers and make the full Compose smoke test explicit while still validating Compose configuration automatically.
- **[Lease expiry can overlap a slow but live publisher]** → Set the lease well above send timeout, use instance ownership checks on completion, and rely on stable event IDs/inbox idempotency when overlap still occurs.
- **[Failure diagnostics may leak sensitive data]** → Store exception class/category and bounded sanitized messages only; never persist stack traces, SQL, or full broker credentials.
- **[Inbox failure recording is not atomic with rolled-back business work]** → The failure recorder is intentionally a separate transaction; if it also fails, Kafka redelivery reconstructs the attempt while success-path correctness remains intact.

## Migration Plan

1. Add agent/project instructions and turn the root POM into an executable application with generated Avro sources.
2. Add Flyway migrations and PostgreSQL configuration; deploy database changes before enabling publishers/listeners.
3. Start Kafka and Schema Registry, set `BACKWARD_TRANSITIVE`, and create the topic with the required replication settings.
4. Register/verify schemas through the producer or smoke test, then start the application with publisher and consumer enabled.
5. Roll back by stopping the application components; database tables and registered schemas remain non-destructive and can be inspected. A code rollback remains able to read previously registered schemas because compatibility is backward-transitive.
