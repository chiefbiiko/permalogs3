# permalogs3

![ci](https://github.com/chiefbiiko/permalogs3/workflows/ci/badge.svg)

a github action that pushes its repo's workflow run logs to s3

## y

![github actions logs expire](https://github.com/chiefbiiko/permalogs3/raw/master/github_actions_logs_expire.png "expired logs")

## usage

``` yaml
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
```

+ prerequisites: aws identity/credentials granting s3 access ((TODO(chiefbiiko): showcase fine-grained iam policy statements)) set as repo secrets

  + the bucket must not exist - it will be created if not

should not be run more often than once a day for a given repo since you will probably hit the github api's rate limit otherwise.

## license

[MIT](./LICENSE)