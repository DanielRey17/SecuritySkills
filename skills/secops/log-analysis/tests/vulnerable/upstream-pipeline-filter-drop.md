# Vulnerable fixture: upstream pipeline suppresses high-value events

## Input

```yaml
# fluent-bit-values.yaml
outputs:
  - name: splunk
    match: "auth.*"
    host: splunk.example.internal
    tls: true
filters:
  - name: grep
    match: "auth.*"
    exclude:
      - key: "EventID"
        pattern: "4624|4625|4672|4728"
```

## Expected assessment

- Telemetry integrity status: fail.
- Severity: high, or critical if this occurred during an active incident.
- Confidence impact: negative findings from authentication logs are not reliable.
- Required evidence:
  - collector/filter configuration review
  - parser and route change history
  - source heartbeat
  - drop/error counters and last successful ingestion time

## Why this is vulnerable

The SIEM may still receive `auth.*` data while the collector filter removes the authentication and privilege events analysts need most. A query that finds no suspicious logons is not meaningful until the pipeline filter is reviewed.

