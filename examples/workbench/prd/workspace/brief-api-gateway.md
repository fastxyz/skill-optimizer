# Product Brief: Developer API Gateway

## Background

PlatformX has no public API. Enterprise clients want programmatic access to
automate workflows. Sales estimates we lose $2.1M/year in deals due to the
absence of an API. Three Q2 deals are contingent on API availability.

## Goal

Launch a developer-facing REST API gateway with authentication, rate limiting,
versioning, and documentation so enterprise integrators can access core platform
data and actions.

## Key Users

- **Enterprise developers**: integrate PlatformX into internal tooling and dashboards
- **Partner ISVs**: build marketplace apps on top of PlatformX data
- **Internal platform team**: consume the same API for cross-service integrations

## Business Requirements

- 99.9% monthly uptime SLA
- Rate limits: 1,000 requests/minute (Basic tier), 10,000 req/min (Enterprise tier)
- Authentication: OAuth 2.0 client credentials + static API key support
- p99 response latency < 100ms (excluding downstream service latency)
- Launch with at minimum: /resources, /events, and /webhooks endpoints
- Developer portal with interactive docs (OpenAPI 3.1 spec)
- API versioning from day one (v1 prefix, semver deprecation notices)

## Technical Context

- Existing backend: microservices on Kubernetes (GCP GKE)
- Auth provider: Okta (OIDC)
- Team: 2 platform engineers + 1 developer experience engineer
- Must not introduce stateful data storage in the gateway tier

## Constraints

- SOC 2 Type II compliance required; audit trail for all API calls
- No customer PII stored in gateway logs (hash or omit user identifiers)
- Gateway must be stateless — no session state, no caching layer
- Timeline: beta (3 partners) in 6 weeks, GA in 12 weeks

## Open Questions

- Which API gateway framework? Kong, AWS API Gateway, or custom Envoy config?
- How to handle webhook delivery guarantees (at-least-once vs exactly-once)?
- Quota enforcement: centralized Redis vs distributed token bucket per pod?
