# Detailed Exploration Dimension Guide

This document, from a code‑exploration perspective, instructs sub‑agents on what to look for in the codebase for each dimension. When SKILL.md mentions a dimension, read the corresponding section as needed.

**Core Principle: Exploration is about observing the current state, not designing new solutions. Only record existing implementations in the code; do not propose new approaches.**

---

## 1. Requirements Analysis

### 1.1 Business Context

- Search for configuration files, constant definitions, and enum classes related to the requirements to understand business domain concepts.
- Look for TODO, FIXME, and HACK comments that contain relevant pending tasks.
- Search for references to requirement IDs (e.g., ticket numbers) in the code.

### 1.2 Functional Entry Points and Boundaries

- Locate API route definitions, Controller entry points, and page routes to identify functional entry points.
- Trace the call chain from entry points to core logic.
- Identify the boundaries of the feature – which modules are involved and which are not.

### 1.3 System Context and Dependencies

- Examine import/require dependencies to identify inter‑module relationships.
- Look for external service calls (HTTP requests, RPC, message queues) to identify dependencies on surrounding systems.
- Find configuration items and environment variables to understand how external dependencies are configured.

### 1.4 Logical Architecture

- Infer the current logical architecture from directory structure and module partitioning.
- Look for architecture‑related base classes, interfaces, and abstraction layers to understand the layered design.
- Identify the layers and modules in the current architecture that are relevant to the requirements.

### 1.5 Design Constraints

- Check framework versions and dependency versions (package.json / pom.xml / go.mod, etc.).
- Look for existing constraint declarations (e.g., interface protocols, data format conventions).
- Identify open‑source components used and their version constraints.

### 1.6 Code Entry Points and Localisation/Boundary Definition

- Locate the core code entry files/classes/functions.
- Find key logging statements to serve as anchors for runtime localisation and boundary detection.
- Identify exception handling and error code definitions.

---

## 2. Overall Solution Design

### 2.1 Existing Solution Architecture

- Infer the overall solution approach from the code structure.
- Look for architecture‑related annotations, decorators, and middleware to understand the request processing flow.
- Trace the core data flow: from entry → processing → storage → response, the complete path.

### 2.2 Existing Implementation Patterns

- Identify implementation patterns already used for similar features (e.g., CRUD patterns, event‑driven patterns, plugin patterns).
- Look for reusable utility classes, service classes, and common modules.
- Identify consistency conventions in the project (naming, directory structure, error‑handling style).

### 2.3 Component Partitioning

- Recognise existing component divisions from the directory structure.
- Look for interface definitions between components (interface classes, protocol definitions, event definitions).
- Identify component responsibilities, boundaries, and interaction methods.

### 2.4 Configuration Items and Feature Toggles

- Look for existing configuration definitions (configuration files, environment variables, feature toggles).
- Identify how configuration is read and applied.
- Find existing configuration items relevant to the requirements.

---

## 3. Data Model Design

### 3.1 Core Entities and Relationships

- Find database table definitions (DDL, ORM models, Schema files).
- Infer relationships between entities from foreign keys, association queries, and join operations.
- Look for enum classes and constant definitions to understand the states and types of business entities.

### 3.2 Table Structure Definition

- Read the complete table structure (field names, types, constraints, indexes, default values).
- Look for migration files to understand the evolution history of table structures.
- Identify field naming conventions and common fields (e.g., creation time, update time, soft‑delete markers).

### 3.3 Storage Selection

- Identify the types of storage currently in use (relational, document, KV, cache).
- Look for the usage scenarios and selection rationale for different storage types.
- Recognise whether there are architectures like sharding, read‑write splitting, etc.

### 3.4 Data Access Layer

- Locate DAO/Repository layer implementations to understand data access patterns.
- Identify ORM usage and custom queries.
- Look for transaction management approaches (declarative, programmatic).

### 3.5 Data Changes and Migrations

- Find database migration scripts to understand change procedures.
- Identify data initialisation and seed data.
- Look for data version management mechanisms.

---

## 4. API Planning and Definition

### 4.1 API Style and Conventions

- Infer the API style (REST / GraphQL / gRPC / WebSocket) from route definitions.
- Look for API versioning approaches (URL prefix, Header).
- Identify authentication methods (Token, OAuth, API Key) and middleware.

### 4.2 Interface Inventory

- List all route registrations and Controller methods to compile a complete interface inventory.
- Identify request methods (GET/POST/PUT/DELETE), paths, and parameters.
- Find API documentation (Swagger/OpenAPI definition files, comments).

### 4.3 Detailed Interface Definitions

- Locate request parameter validation logic (parameter types, required fields, value ranges).
- Find response structure definitions (DTOs, VOs, serialisation logic).
- Look for error code definitions and error response formats.

### 4.4 Rate Limiting and Compatibility

- Locate rate‑limiting middleware or annotations.
- Identify backward‑compatibility handling for APIs.
- Look for deprecation markers and sunset policies for obsolete APIs.

---

## 5. Reliability and Availability Design

### 5.1 Fault Handling

- Locate try/catch blocks, error‑handling middleware, and global exception handlers.
- Identify retry mechanisms (retry annotations, retry utility classes).
- Look for use of circuit breakers and fuses.

### 5.2 Fool‑proof Design

- Locate parameter validation logic (front‑end + back‑end validation).
- Identify idempotency guarantees.
- Look for implementations that prevent duplicate submissions.

### 5.3 Overload Protection

- Locate rate‑limiting, throttling, and queueing mechanisms.
- Identify connection pool and thread pool configurations and limits.
- Find timeout configurations.

### 5.4 Degradation Design

- Locate fallback methods and degradation logic.
- Identify fallback strategies when services are unavailable.
- Look for degradation logic controlled by feature toggles.

### 5.5 Redundancy Design

- Locate cluster deployment configurations.
- Identify stateless design or session management approaches.
- Find health check endpoints and load‑balancing configurations.

---

## 6. Security and Privacy Design

### 6.1 Trust Boundaries

- Identify entry points exposed to the outside (API gateways, web ports, message consumers).
- Locate calls that cross trust boundaries (external HTTP calls, third‑party SDKs).
- Identify authentication between internal services.

### 6.2 Authentication and Authorisation

- Locate authentication middleware, authorisation annotations, and permission validation logic.
- Identify role definitions and permission models.
- Look for token generation, validation, and refresh mechanisms.

### 6.3 Data Protection

- Locate encryption/decryption utility classes and call sites.
- Identify how sensitive data is stored (whether encrypted, whether masked).
- Look for data masking in logs.

### 6.4 Security Protections

- Locate input validation, XSS/CSRF protections.
- Identify SQL injection protections (parameterised queries, ORM).
- Look for audit log recording.

---

## 7. Performance Design

### 7.1 Existing Performance Characteristics

- Locate caching usage (Redis, local cache, caching annotations).
- Identify asynchronous processing (message queues, async annotations, workers).
- Locate batch operations and pagination query implementations.

### 7.2 Performance Bottlenecks

- Identify N+1 queries and full‑table scan risks.
- Locate scenarios with large‑object serialisation and bulk data loading.
- Identify synchronous blocking call chains.

### 7.3 Impact on Existing Performance

- Identify hot code paths and assess the impact of requirement changes on them.
- Look for existing performance benchmarks or load‑test configurations.

---

## 8. Operations Design

### 8.1 Logging

- Locate the logging framework and log‑level configurations.
- Identify key business log recording points and formats.
- Find how trace IDs are propagated.

### 8.2 Alerting

- Locate alert rule definition files or configurations.
- Identify key monitoring metrics such as error rates and latency.

### 8.3 Monitoring

- Locate monitoring metric instrumentation (Metrics annotations, instrumentation code).
- Identify health check endpoints and readiness probes.
- Look for dashboard configuration files.

### 8.4 Deployment and Upgrades

- Locate database migration scripts to understand upgrade order.
- Identify canary‑release mechanisms controlled by feature toggles.
- Look for deployment configurations (Dockerfile, K8s configurations).

### 8.5 Localisation and Boundary Detection

- Locate key logging statements and error codes as anchoring points for localisation.
- Identify runtime status check endpoints.
- Look for diagnostic tools and management endpoints.

---

## 9. Documentation Design

- Locate existing documentation directories and documentation generation tools.
- Identify automatic API documentation mechanisms (e.g., Swagger annotations).
- Look for existing materials like README, CHANGELOG, and user guides.

---

## 10. UI/Page Design

### 10.1 Page Structure and Routing

- Locate front‑end route definitions to list pages and navigation relationships.
- Identify the hierarchical structure and composition of page components.
- Locate common layout components and page templates.

### 10.2 Interaction Flows

- Infer user interaction flows from component code and state management.
- Locate interaction patterns for form submission, data loading, and error handling.
- Identify usage of modal dialogs, drawers, toast notifications, and other interactive components.

### 10.3 Design Constraints

- Identify the UI component library and its version.
- Locate internationalisation (i18n) configuration and usage.
- Locate theme configuration and style conventions.
- Identify how responsive layout is implemented.

---

## 11. Testing Recommendations

### 11.1 Existing Test Structure

- Locate test directories and test files to determine test coverage.
- Identify test frameworks and test tool configurations.
- Look for mock/stub usage patterns.

### 11.2 Key Test Scenarios

- Infer critical test scenarios from business logic code.
- Identify boundary conditions and exception paths.
- Locate existing integration tests and end‑to‑end tests.

### 11.3 Testing Infrastructure

- Locate test steps in CI/CD configurations.
- Identify test data preparation and cleanup methods.
- Locate test coverage configurations and thresholds.
