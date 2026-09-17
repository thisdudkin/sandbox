# Spec Delta

## Purpose

Defines a reproducible local environment in which Kafka, Schema Registry, database-backed application flows, and contract registration can be verified together.

## ADDED Requirements

### Requirement: Kafka topology remains resilient
The Compose environment SHALL run three dedicated KRaft controllers and three brokers, with the order-events topic configured for three partitions, replication factor three, and minimum in-sync replicas two.

#### Scenario: Topic is initialized
- **WHEN** the Compose stack becomes healthy
- **THEN** the order-events topic exists with three partitions, replication factor three, and `min.insync.replicas=2`

### Requirement: Schema Registry is available
The Compose environment SHALL run a pinned Schema Registry version compatible with Kafka 4.0, connect it to all three internal broker listeners, expose its HTTP API on loopback, and configure `BACKWARD_TRANSITIVE` compatibility.

#### Scenario: Registry becomes healthy
- **WHEN** healthy brokers are available and Schema Registry starts
- **THEN** its loopback health endpoint responds successfully and reports access to registered subjects

### Requirement: Local stack is verifiable
The project SHALL provide documented commands and automated configuration checks for Compose rendering, service health, Kafka topic metadata, and Schema Registry compatibility.

#### Scenario: Static Compose validation succeeds
- **WHEN** `docker compose config --quiet` is run
- **THEN** the complete Compose model is syntactically valid

#### Scenario: Local infrastructure smoke test succeeds
- **WHEN** the documented smoke-test command runs against a healthy stack
- **THEN** it verifies broker reachability, topic settings, Schema Registry reachability, and schema registration without publishing JSON records

