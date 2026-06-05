# GitHub token permission fixtures

These fixtures cover CICD-SEC-2 classification for GitHub Actions `GITHUB_TOKEN` permissions. They are intended as regression examples for avoiding false positives while preserving true broad-scope findings.

## Fixture 1: Missing permissions with unknown platform default

```yaml
name: build
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

Platform evidence:

```text
repository_default_workflow_permission: unknown
organization_default_workflow_permission: unknown
enterprise_default_workflow_permission: unknown
```

Expected classification:

- CICD-SEC-2 status: `Not Evaluable from Config`
- Severity: Low hygiene gap unless other evidence proves write exposure
- Rationale: Missing YAML `permissions` inherits platform defaults, which are not present in the workflow file.

## Fixture 2: Missing permissions with verified read-only default

```yaml
name: build
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

Platform evidence:

```text
repository_default_workflow_permission: read repository contents permission
organization_default_workflow_permission: read repository contents permission
enterprise_default_workflow_permission: read repository contents permission
```

Expected classification:

- CICD-SEC-2 status: `Pass` or `Partial`
- Severity: Informational hygiene recommendation
- Rationale: Effective default is read-only, but explicit job-level least privilege is still clearer.

## Fixture 3: Missing permissions with verified read/write default

```yaml
name: release
on: push
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Platform evidence:

```text
repository_default_workflow_permission: read and write permissions
organization_default_workflow_permission: read and write permissions
enterprise_default_workflow_permission: read and write permissions
```

Expected classification:

- CICD-SEC-2 status: `Fail`
- Severity: High unless the workflow is explicitly narrowed before privileged steps run
- Rationale: Missing YAML `permissions` inherits a verified read/write platform default, so this is no longer merely "Not Evaluable from Config."

## Fixture 4: Explicit write-all

```yaml
name: release
on: push
permissions: write-all
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Expected classification:

- CICD-SEC-2 status: `Fail`
- Severity: High unless every write scope is justified
- Rationale: `write-all` grants every available write scope and should be replaced with job-level least privilege.

## Fixture 5: pull_request_target without explicit token reduction

```yaml
name: label
on: pull_request_target
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr edit "$PR_URL" --add-label needs-triage
        env:
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
```

Expected classification:

- CICD-SEC-2 status: `Fail`
- Severity: High
- Rationale: `pull_request_target` receives read/write repository permission unless the workflow reduces the token with `permissions`.

## Fixture 6: pull_request_target with reduced token

```yaml
name: label
on: pull_request_target
permissions:
  contents: read
  pull-requests: write
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr edit "$PR_URL" --add-label needs-triage
        env:
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
```

Expected classification:

- CICD-SEC-2 status: `Pass` or `Partial`
- Severity: Low if the write scope is required and PR code is not checked out or executed
- Rationale: The workflow uses the risky trigger but explicitly narrows token scope to the operation it performs.
