# Product Brief: AI-Powered Smart Search

## Background

Our e-commerce platform (ShopCore) uses basic keyword matching for product search.
Customers cannot find products using natural language queries like "comfortable
shoes for flat feet under $80". Current search-to-purchase conversion rate is 12%,
well below the industry average of 23%. Support tickets mentioning "couldn't find"
account for 18% of all tickets.

## Goal

Replace the keyword search backend with a semantic/AI search system to improve
product discoverability and conversion.

## Key Users

- **Casual shoppers**: browse by description, unsure of exact product names
- **Power users**: filter-heavy, compare specs, research-oriented
- **Mobile users**: short queries, voice-to-text input, limited screen space

## Business Requirements

- Improve search-to-purchase conversion from 12% to at least 17%
- Search results returned within 200ms at the 95th percentile under load
- Achieve ≥85% Precision@10 on the ShopCore product benchmark dataset
- Support 50,000 concurrent users at peak (Black Friday traffic model)
- Spell correction and synonym handling required
- Multi-language support: English and Spanish at launch

## Technical Context

- Current backend: Elasticsearch 7 on AWS
- Product catalog: 2.4M SKUs, updated nightly
- Team: 3 backend engineers, 1 ML engineer, 1 data engineer
- Existing infra: AWS (ECS, RDS, S3)

## Open Questions

- Which embedding model (OpenAI ada-002, Cohere, or self-hosted)?
- How to handle real-time inventory filtering with vector search?
- Fallback strategy when AI search returns low-confidence results?

## Constraints

- Launch must not break existing category-browse or filter UX
- GDPR compliance required for EU shoppers (no personal query logging without consent)
- Budget: $15k/month cloud budget cap for new infra
- Timeline: MVP in 3 months, full rollout in 6 months
