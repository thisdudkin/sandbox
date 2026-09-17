# Spec Delta

## Purpose

Defines the externally visible HTTP contract for creating a minimal food order while keeping transport DTOs separate from stored domain data.

## ADDED Requirements

### Requirement: Create a food order
The system SHALL accept `POST /api/orders` with a customer identifier and one or more food items, and SHALL return HTTP 201 with an order response containing the generated order identifier, `CREATED` status, creation time, and accepted items.

#### Scenario: Valid order is created
- **WHEN** a client submits a non-blank customer identifier and items with non-blank names and positive quantities
- **THEN** the response is HTTP 201 and its DTO identifies the newly created order in `CREATED` status

### Requirement: Validate order input
The system SHALL reject blank customer identifiers, empty item lists, blank item names, and quantities outside the supported range of 1 through 99 with HTTP 400.

#### Scenario: Invalid order is rejected
- **WHEN** a client submits an empty item list or an item with a non-positive quantity
- **THEN** no order is created and the response is HTTP 400 with stable field-level validation details

### Requirement: Centralized REST errors
The system SHALL map validation, domain, and unexpected failures to a consistent error DTO without exposing persistence entities, stack traces, or infrastructure details.

#### Scenario: Domain error is mapped
- **WHEN** order creation raises a recognized domain exception
- **THEN** the centralized advice returns the documented HTTP status and a stable error code

#### Scenario: Unexpected error is sanitized
- **WHEN** order creation raises an unexpected infrastructure exception
- **THEN** the response is HTTP 500 and contains no stack trace, SQL text, broker address, or internal class name

