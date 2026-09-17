# Spec Delta

## Purpose

Defines transactional, observable, and idempotent handling of delivered order events, including bounded retry and controlled recovery after failure.

## ADDED Requirements

### Requirement: Transactional successful handling
For a new event, the consumer SHALL create or update its inbox record, apply the local order projection business effect, and mark the inbox record `PROCESSED` in one database transaction before allowing the Kafka offset to be committed.

#### Scenario: New event is processed
- **WHEN** a valid order-created event with an unseen event identifier is delivered
- **THEN** one order projection exists and the corresponding inbox row is `PROCESSED` in the same committed transaction

#### Scenario: Successful transaction rolls back
- **WHEN** the local business effect fails before the transaction commits
- **THEN** neither a partial projection nor a `PROCESSED` inbox state is durable

### Requirement: Duplicate suppression
The inbox SHALL enforce uniqueness by event identifier and SHALL treat an already `PROCESSED` event as a successful no-op.

#### Scenario: Processed event is redelivered
- **WHEN** the same event identifier is delivered after successful processing
- **THEN** the consumer performs no additional business effect and permits the duplicate record offset to be committed

#### Scenario: Duplicate arrives concurrently
- **WHEN** two consumer executions race to handle the same event identifier
- **THEN** the uniqueness constraint and transactional handling result in exactly one durable business effect

### Requirement: Controlled consumer failure and retry
On a retryable processing error, the system SHALL roll back the business transaction, durably record `FAILED`, increment the inbox attempt count, retain sanitized diagnostics, and ask Kafka to redeliver according to bounded configurable backoff. After the maximum attempt count it SHALL recover the record without an endless hot loop and retain terminal `FAILED` state.

#### Scenario: A transient failure is recovered
- **WHEN** the first handling attempt fails and a later redelivery succeeds before the attempt limit
- **THEN** exactly one business effect is committed and the inbox row becomes `PROCESSED` with its attempt history retained

#### Scenario: Retry limit is exhausted
- **WHEN** every delivery attempt fails through the configured limit
- **THEN** the offset is recoverably advanced, the inbox row remains `FAILED`, and the final diagnostic and attempt count are retained

### Requirement: Explicit reprocessing
The application service SHALL allow a terminal failed inbox event to be requeued only by an explicit operation, without changing its event identifier or bypassing duplicate checks.

#### Scenario: Operator requeues a failed event
- **WHEN** an authorized local maintenance operation requeues a terminal `FAILED` inbox record and the event is delivered again
- **THEN** processing resumes under the same bounded policy and can transition that inbox record to `PROCESSED`

