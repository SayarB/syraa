---
name: Daily review
enabled: true
mode: report
timezone: UTC
timeout_minutes: 30
notify: findings
outputs:
  report: report.md
---

Review recent changes in this repository.
Focus on correctness bugs, security issues, and broken invariants.
Write a concise report to the configured /out report path.
If nothing material, say so explicitly.
