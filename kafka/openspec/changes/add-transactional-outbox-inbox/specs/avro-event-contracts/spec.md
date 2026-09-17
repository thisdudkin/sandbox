# Spec Delta

## Purpose

Defines versioned Avro contracts and Schema Registry behavior for every Kafka key and value so no Kafka test or runtime path relies on JSON payloads.

## ADDED Requirements

### Requirement: Generated Avro key and value contracts
Kafka order records SHALL use generated specific-record classes from version-controlled `.avsc` files for both the key and value. The key SHALL provide stable order partitioning, and the value SHALL include a stable event identifier, order identifier, occurrence time, customer identifier, and order items.

#### Scenario: Key and value serialize independently
- **WHEN** a generated order-event key and order-created value are serialized
- **THEN** each produces a Confluent wire-format payload that can be independently deserialized to its generated type

#### Scenario: Kafka record is not JSON
- **WHEN** a publisher sends or a test constructs an order-created Kafka record
- **THEN** it uses the Avro serializers and generated records rather than a JSON serializer, JSON string, or hand-written duplicate event model

### Requirement: Stable subjects and compatibility policy
The producer and consumer SHALL use `TopicRecordNameStrategy` for key and value subjects. Schema Registry SHALL enforce `BACKWARD_TRANSITIVE` compatibility so each new reader can consume all previously registered versions within the same topic-and-record subject.

#### Scenario: Subjects are registered predictably
- **WHEN** the order key and value schemas are first published to the order-events topic
- **THEN** Schema Registry contains separate topic-and-record subjects for their fully qualified Avro names

#### Scenario: Compatible optional field is added
- **WHEN** a new optional field with a default is introduced and checked against every prior value-schema version
- **THEN** Schema Registry accepts the new version under `BACKWARD_TRANSITIVE` policy

#### Scenario: Incompatible required field is rejected
- **WHEN** a required value field without a default is introduced
- **THEN** the compatibility check rejects registration for the existing subject

### Requirement: Schema evolution discipline
Existing field meanings, event identifiers, record names, namespaces, and field types SHALL remain stable. Additive fields SHALL be nullable or have a compatible default, and any breaking semantic contract SHALL use a new Avro record name and event type.

#### Scenario: Existing event evolves additively
- **WHEN** the order-created contract needs additional non-breaking information
- **THEN** the field is added with a compatible default and the compatibility test remains green

