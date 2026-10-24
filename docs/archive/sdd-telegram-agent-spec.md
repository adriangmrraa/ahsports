# Specification: AI Telegram Sales Agent

## Requirement: Secure agent configuration and access
The system MUST restrict agent configuration, channel administration, and conversation administration to authenticated users with an authorized role. It SHALL validate every configuration and webhook input with Zod. Provider credentials, bot tokens, and webhook secrets MUST be encrypted at rest, never returned after saving, and never logged. Deployment configuration MUST validate required secrets before runtime and MUST NOT use database push or seed operations.

#### Scenario: Save protected configuration
**Given** an authorized administrator submits valid provider, model, or channel settings
**When** the system saves the settings
**Then** it SHALL persist non-secret values, encrypt secret values, return only write-only secret status, and record the acting administrator.

#### Scenario: Reject unauthorized configuration
**Given** an unauthenticated or unauthorized requester
**When** it accesses an agent administration operation
**Then** the system MUST deny the operation without exposing configuration or secrets.

## Requirement: Canonical omnichannel conversation record
The system MUST keep conversations and messages as database facts with a stable customer identity, channel, direction, sender, timestamp, provider message ID, and normalized content. It SHALL persist customer inbound messages, Telegram-agent outbound messages, and imported WhatsApp Business operator outbound messages in the same canonical timeline. Duplicate provider deliveries MUST NOT create duplicate facts.

#### Scenario: Import an operator reply
**Given** a WhatsApp Business operator outbound message for a known customer
**When** it is imported
**Then** the system SHALL attach it to the customer conversation as an operator-authored outbound fact without sending a WhatsApp message.

## Requirement: Telegram internal agent
The system MUST provide a Telegram-first internal agent that binds each request to its verified transport sender and authorized internal identity. It SHALL persist inbound commands and assistant replies, support only authorized administrative capabilities, and provide actionable denial messages for unauthorized users.

#### Scenario: Receive an internal command
**Given** an authorized operator sends a Telegram command
**When** the webhook is verified and processed
**Then** the system SHALL persist the inbound message, generate the permitted response, and persist the outbound response before delivery.

## Requirement: Configurable AI sales assistance
Administrators MUST be able to select the supported AI provider and model without a code change. The AI agent SHALL use persisted conversation context and read-only tools for conversation analysis, missing-information detection, and sales-performance insights. It MUST treat external message content as untrusted and MUST NOT invent authoritative price, stock, order, or payment facts.

#### Scenario: Analyse a customer conversation
**Given** an authorized operator requests an analysis
**When** the agent receives the conversation context
**Then** it SHALL return evidence-based findings and clearly identify missing data or uncertainty.

## Requirement: Guardrailed commerce drafting
The AI agent MAY create draft leads, quotes, and orders only through validated domain tools. It MUST use authoritative pricing services and transactional persistence for multi-step drafts. It MUST NOT finalize orders, collect or register payments, or perform irreversible commerce actions autonomously; a human MUST explicitly review and confirm each draft through an existing authorized flow.

#### Scenario: Produce a quote draft
**Given** a customer requests a quote with incomplete or complete requirements
**When** the agent invokes a commerce tool
**Then** it SHALL validate inputs, obtain authoritative pricing, save a reviewable draft, and report that human confirmation is required.

## Requirement: Admin visibility, resilience, and audit
The admin experience MUST provide authorized views for agent configuration, Telegram status, and searchable conversation timelines, including message provenance and delivery/import state. Webhook and asynchronous work SHALL be idempotent, retry-safe, and auditable. Failures MUST preserve the original fact, record a structured audit event with correlation data, and avoid duplicate external delivery or duplicate draft creation.

#### Scenario: Retry a delivered webhook
**Given** a provider retries a previously accepted message
**When** the system receives the same platform message ID
**Then** it SHALL return a safe success outcome, create no duplicate message or draft, and retain the original audit trail.