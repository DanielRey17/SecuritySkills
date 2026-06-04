# Vulnerable fixture: delayed and replayed events distort timeline

## Input

```text
2026-06-03T02:00:00Z source=edr-01 event_id=proc-889 command="powershell -enc <redacted>" event_time=2026-06-03T01:17:22Z ingest_time=2026-06-03T02:00:00Z batch_id=replay-20260603
2026-06-03T02:00:01Z source=edr-01 event_id=proc-889 command="powershell -enc <redacted>" event_time=2026-06-03T01:17:22Z ingest_time=2026-06-03T02:00:01Z batch_id=replay-20260603
```

## Expected assessment

- Telemetry integrity status: partial.
- Severity: medium for timeline confidence, higher if duplicate events drove an automated response.
- Confidence impact: the event is suspicious, but counts and ordering are unreliable until deduplicated.
- Required evidence:
  - event occurrence time
  - SIEM ingestion time
  - stable event ID or message hash
  - replay batch ID
  - late-arrival handling and re-query window

## Why this is vulnerable

The same process event appears twice due to a replay batch and arrives more than forty minutes after occurrence. Analysts must deduplicate it and update the timeline instead of treating the two entries as separate executions or ignoring late-arriving evidence.

