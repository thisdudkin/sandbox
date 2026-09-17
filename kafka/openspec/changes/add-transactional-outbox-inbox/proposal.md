# Proposal

## Why

The repository currently provides only Kafka infrastructure and a packaging POM, so it cannot demonstrate how a food order moves reliably from a database transaction through Kafka to an idempotent consumer. This change creates a small, executable teaching system whose tests make the real at-least-once guarantees, duplicate windows, retry behavior, and Avro contract rules observable.

## What Changes

- Add a Spring Boot MVC order API with validated request/response DTOs and centralized error handling.
- Persist an order and its outbox event atomically, then publish pending events independently with bounded retries and concurrency-safe database claiming.
- Serialize Kafka keys and values with Confluent Schema Registry and generated Avro classes; never use JSON for Kafka records.
- Consume order-created events through an inbox that makes the business effect idempotent, records failures, and supports controlled redelivery.
- Extend the local KRaft Compose environment with Schema Registry, explicit topic initialization, and health checks.
- Add unit, persistence, MVC, Kafka, Schema Registry compatibility, duplicate-delivery, and failure/retry tests.
- Add maintained agent guidance, developer commands, architectural rules, TDD workflow, and OpenSpec conventions.

## Capabilities

### New Capabilities

- `order-api`: Validated REST creation of food orders and stable success/error contracts without exposing persistence entities.
- `transactional-outbox`: Atomic order/outbox persistence plus concurrency-safe publication, diagnostics, and bounded retry behavior.
- `idempotent-inbox`: Transactional inbox processing, duplicate suppression, business-effect idempotency, and controlled failure/retry states.
- `avro-event-contracts`: Generated and versioned Avro key/value contracts, Schema Registry configuration, naming strategy, and compatibility verification.
- `local-messaging-environment`: Reproducible local Kafka KRaft, Schema Registry, topics, and observable health through Docker Compose.

### Modified Capabilities

None. The project has no existing capability specifications.

## Impact

The change turns the root Maven project into an executable Spring Boot application and adds application source, database migrations, Avro schemas and code generation, test suites, configuration, and documentation. It extends `compose.yml` with Schema Registry and topic initialization while retaining the existing three-controller/three-broker topology. New dependencies are limited to Spring MVC, validation, JPA/JDBC transaction support, PostgreSQL, Spring Kafka, Confluent Avro serialization, Avro code generation, Flyway, and test infrastructure needed for real database/Kafka/Schema Registry checks.
