# Spec Delta

## Purpose

Defines atomic creation and reliable asynchronous publication of order events through a database-backed transactional outbox with explicit duplicate windows.

## ADDED Requirements

### Requirement: Atomic order and outbox persistence
The system SHALL store a newly created order, all of its items, and exactly one uniquely identified outbox message in the same database transaction.

#### Scenario: Creation transaction commits
- **WHEN** a valid order creation transaction completes successfully
- **THEN** both the order aggregate and one pending outbox message with the same order identifier are durable

#### Scenario: Creation transaction rolls back
- **WHEN** any failure occurs after the order is written but before the transaction commits
- **THEN** neither the order nor its outbox message remains durable

### Requirement: Diagnostic outbox record
Each outbox message SHALL retain a unique event identifier, aggregate identifier, event type, Avro-encoded payload, schema identity, status, attempt count, creation/update timestamps, next-attempt time, and the latest publication error. The event identifier SHALL remain unchanged across every retry.

#### Scenario: Pending message is inspectable
- **WHEN** an order and outbox message are committed
- **THEN** the message is `PENDING`, has zero publication attempts, contains a decodable Avro payload, and has no publication error

### Requirement: Concurrency-safe publication
The publisher SHALL claim eligible messages using database locking that skips rows already claimed by another publisher, and SHALL prevent two healthy publisher instances from simultaneously processing the same outbox row.

#### Scenario: Competing publishers poll the same queue
- **WHEN** two publisher instances poll while one eligible message exists
- **THEN** at most one instance owns that row during the claim lease and the other instance continues without blocking on it

#### Scenario: Abandoned claim is recovered
- **WHEN** a publisher stops after claiming a row and the configured lease expires
- **THEN** a later publisher can reclaim the same event identifier for another attempt

### Requirement: Avro publication and retry policy
The publisher SHALL publish the generated Avro key and value to the configured order-events topic, mark the outbox message `PUBLISHED` only after broker acknowledgement, and retry transient failures using configurable bounded backoff. After the configured maximum attempts it SHALL mark the message `FAILED` and retain diagnostic details.

#### Scenario: Publication succeeds
- **WHEN** Kafka acknowledges a pending order-created event
- **THEN** the outbox message becomes `PUBLISHED`, records its publication time, and is excluded from later pending polls

#### Scenario: Publication fails transiently
- **WHEN** Kafka publication fails before the maximum attempt count
- **THEN** the message becomes retryable with an incremented attempt count, sanitized last error, and a future next-attempt time

#### Scenario: Publication exhausts retries
- **WHEN** Kafka publication continues to fail through the configured maximum attempt count
- **THEN** the message becomes `FAILED` and is not automatically selected until explicitly requeued

### Requirement: Honest delivery guarantee
The documented guarantee SHALL be at-least-once publication from the outbox, not end-to-end exactly-once delivery. A crash after Kafka acknowledgement but before the database status update SHALL be documented and tested as a source of duplicate events.

#### Scenario: Publisher crashes in the acknowledgement window
- **WHEN** Kafka has stored an event but its outbox row is not durably marked `PUBLISHED`
- **THEN** the same event identifier can be published again and downstream idempotency prevents a repeated business effect

