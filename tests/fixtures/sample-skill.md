---
name: deploy-service
description: A skill for deploying microservices to Kubernetes
---

# Deploy Service

A comprehensive skill for deploying, validating, and monitoring microservice deployments.

## Phase 1 — Requirements Discovery

Ask clarifying questions about the deployment target until you have enough information:

1. Which environment? (staging, production, canary)
2. Which service name and version?
3. Any special resource limits or scaling requirements?

If the user specifies "production", require explicit confirmation before proceeding.
When the user says "canary", ask for the traffic percentage split.

## Phase 2 — Manifest Generation

Generate the Kubernetes manifests based on gathered requirements:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <service-name>
  namespace: <environment>
spec:
  replicas: <replica-count>
  template:
    spec:
      containers:
        - name: <service-name>
          image: <registry>/<service-name>:<version>
          resources:
            limits:
              cpu: <cpu-limit>
              memory: <memory-limit>
```

1. Create the Deployment resource
2. Create the Service resource
3. Create the HorizontalPodAutoscaler if scaling is requested
4. Apply namespace-specific overrides

Do not include deprecated API versions.
Never use `latest` as an image tag.

## Phase 3 — Validation and Testing

Run pre-deployment checks to ensure correctness:

```bash
kubectl apply --dry-run=server -f manifests/
kubectl diff -f manifests/
```

Either run a smoke test suite or skip if the user explicitly opts out.

Verify the following before proceeding:
- All container images exist in the registry
- Resource limits are within cluster quotas
- No conflicting service names in the target namespace

| Check | Tool | Pass Criteria |
|-------|------|---------------|
| Image exists | crane digest | Exit code 0 |
| Quota check | kubectl describe quota | Used < Limit |
| Name conflict | kubectl get svc | Not found |
