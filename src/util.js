const { getInput } = require("@actions/core");

function cutWorkflowId(workflowUrl) {
  return Number(workflowUrl.split("/").pop());
}

const WORKFLOW_RUN_ID_PATTERN = /^.+-(\d+)\.json$/;

function extractWorkflowRunId({ Key: s3ObjectKey }) {
  return Number(s3ObjectKey.replace(WORKFLOW_RUN_ID_PATTERN, "$1"));
}

const ARROW_PATTERN = /^\s*<|>\s*$/g;

function getPageNumbers(linkHeader) {
  const parts = linkHeader.split(",").map(part => part.trim());
  
  const nextPart = parts.find(part => part.includes('rel="next"'));
  const lastPart = parts.find(part => part.includes('rel="last"'));

  let next = 0;
  let last = 0;

  if (nextPart) {
    const url = new URL(nextPart.split(";")[0].replace(ARROW_PATTERN, ""));

    next = Number(url.searchParams.get("page"));
  }

  if (lastPart) {
    const url = new URL(lastPart.split(";")[0].replace(ARROW_PATTERN, ""));

    last = Number(url.searchParams.get("page"));
  }

  return { next, last };
}

function getParams() {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

  const params = {
    region: getInput("aws_region") || process.env.AWS_REGION,
    bucket: getInput("bucket") || process.env.BUCKET,
    extraS3Opts: JSON.parse(
      getInput("extra_s3_opts") || process.env.EXTRA_S3_OPTS || "null"
    ),
    extraS3Params: JSON.parse(
      getInput("extra_s3_params") || process.env.EXTRA_S3_PARAMS || "null"
    )
  };

  if (!owner || !repo) {
    throw new Error(
      "unset env var GITHUB_REPOSITORY - must read owner/repo"
    );
  }
  
  if (!(process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN)) {
    throw new Error(
      "unset env var GITHUB_TOKEN - alternatively use the input github_token"
    );
  }

  if (!params.region || !params.bucket) {
    throw new Error(
      "undefined params - either pass inputs aws_region and bucket or set " +
        "the corresponding env vars AWS_REGION and BUCKET"
    );
  }

  return { owner, repo, params };
}

function mergeDocs(docs) {
  return docs.reduce((acc, cur) => Object.assign(acc, cur), {});
}

function summary(count, bucket) {
  if (count) {
    return [
      "🏁",
      "just pushed",
      count,
      "unstashed workflow run logs to bucket",
      bucket
    ].join(" ");
  } else {
    return ["✨ bucket", bucket, "state is up-2-date"].join(" ");
  }
}

function toS3ObjectKeyPrefix(owner, repo) {
  return `${owner}/${repo}/workflow-runs/`;
}

const NOT_ALPHANUMERIC_PATTERN = /[^a-zA-Z0-9]/g;

function toS3ObjectKey(owner, repo, workflow, workflowRun) {
  const date = workflowRun.created_at.slice(0, 10);

  const workflowRunMetaData = [
    workflowRun.event,
    workflowRun.head_branch,
    workflowRun.head_sha,
    workflowRun.id
  ].join("-");

  return [
    owner,
    repo,
    "workflow-runs",
    workflow.name.replace(NOT_ALPHANUMERIC_PATTERN, "-"),
    date,
    `${workflowRunMetaData}.json`
  ].join("/");
}

module.exports = {
  cutWorkflowId,
  extractWorkflowRunId,
  getPageNumbers,
  getParams,
  mergeDocs,
  summary,
  toS3ObjectKeyPrefix,
  toS3ObjectKey
};
