# Benign fixture: documented maintenance ingestion gap

## Input

```text
2026-06-03T01:00:00Z sensor=edge-fw-01 status=maintenance action=pause-forwarding reason="planned parser upgrade" ticket=CHG-1842
2026-06-03T01:05:00Z siem=main source=edge-fw-01 ingestion_gap_start=2026-06-03T01:00:01Z ingestion_gap_end=2026-06-03T01:04:58Z expected_events=0
2026-06-03T01:06:00Z sensor=edge-fw-01 status=active action=resume-forwarding ticket=CHG-1842
```

## Expected assessment

- Telemetry integrity status: degraded but documented.
- Severity: low visibility limitation, not a compromise finding.
- Confidence impact: low to medium depending on the investigation hypothesis.
- Required evidence:
  - change ticket `CHG-1842`
  - pause and resume records
  - expected event count for the maintenance window
  - no corroborating evidence of audit clearing, sensor disablement, or unexplained drops

## Why this is benign

The collection gap is explained by a planned parser upgrade and has resume evidence. Analysts should document the visibility limitation, but should not treat the gap as anti-forensics without corroborating evidence.

