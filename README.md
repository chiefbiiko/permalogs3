# permalogs3

![ci](https://github.com/chiefbiiko/permalogs3/workflows/ci/badge.svg)

a github action that pushes its repo's workflow run logs to s3

## y

<p align="center">
  <img width="786" height="164" src="https://raw.githubusercontent.com/chiefbiiko/permalogs3/master/github_actions_logs_expire.PNG" alt="github actions logs expire" title="expiring logs">
</p>

## prerequisites

1. aws identity with s3 access, especially the following policy statements: 

``` yml
Statement:
  - Sid: AllowHeadAndListBucket
    Effect: Allow
    Action:
      - s3:HeadBucket
      - s3:ListBucket
    Resource: arn:aws:s3:::bucketfulloflogs-9999999999999
  - Sid: AllowPutObject
    Effect: Allow
    Action: s3:PutObject
    Resource: arn:aws:s3:::bucketfulloflogs-9999999999999/*
  # below is obviously required if u r having permalogs3 creating ur bucket
  - Sid: AllowCreateBucket
    Effect: Allow
    Action: s3:CreateBucket
    Resource: arn:aws:s3:::bucketfulloflogs-9999999999999
```

2. respective aws credentials set as github repo secrets: `secrets.AWS_ACCESS_KEY_ID`, `secrets.AWS_SECRET_ACCESS_KEY`

3. *optional* - s3 bucket - will be created if not existing. in such cases make sure the bucket name is reasonably unique - to avoid errors when creating the bucket.

## usage

run the action on a daily, weekly or whatever schedule.

for each completed workflow run one json file gets stored in s3. see details below.

the action is idempotent and only pushes unstashed logs to s3.

``` yml
on:
  schedule:
    # daily@04:19am
    - cron: "19 4 * * *"

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: chiefbiiko/permalogs3@v0.1.0
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: us-east-1
          BUCKET: permalogs3testingstack-bucket-13p5inhfqasui
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # EXTRA_S3_OPTS: initialization options for the aws-sdk-js s3 client
          # EXTRA_S3_PARAMS: bound params for the aws-sdk-js s3 client 
```

the action can also be configured via inputs. see [`action.yml`](./action.yml).

should not be run excessively for a given repo since you will probably hit the github api's rate limit otherwise - once a day should be fine afaict.

## s3 object key pattern

**key components**

`<owner>/<repo>/workflow-runs/<workflowName>/<date>/<event>-<headBranch>-<headSha>-<workflowRunId>.json`

**example**

`chiefbiiko/permalogs3/workflow-runs/ci/2020-02-29/push-master-0a80a1802ef0b949a9253c289cecd3976a16638d-47380326.json`

## s3 object json schema

``` js
{
  type: "object",
  properties: {
    s3ObjectKey: {
      type: "string",
      pattern: "^[^\\s]+\\/[^\\s]+\\/workflow-runs\\/[^\\s]+\\/\\d\\d\\d\\d-\\d\\d-\\d\\d\\/[^\\s]+-[^\\s]+-[a-f0-9]{40}-\\d+\.json$"
    },
    id: { type: "integer" },
    head_branch: { type: "string", minLength: 1 },
    head_sha: { type: "string", pattern: "^[0-9a-f]{40}$" },
    event: { type: "string", minLength: 1 },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["completed"] },
    conclusion: { type: "string", enum: ["failure", "success"] },
    html_url: { type: "string", format: "uri" },
    pull_requests: { type: "array", items: { type: "object" } },
    workflow: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
        state: { type: "string", enum: ["active", "inactive"] },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" }
      }
    },
    jobs: {
      type: "object",
      patternProperties: {
        ".+": {
          type: "object",
          properties: {
            id: { type: "integer" },
            started_at: { type: "string", format: "date-time" },
            completed_at: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["completed"] },
            conclusion: { type: "string", enum: ["failure", "success"] },
            logs: { type: "string" }
          }
        }
      },
      additionalProperties: false
    }
  }
}
```

## license

[MIT](./LICENSE)