const { join } = require("path");

const WORKFLOW_RUN_ID_PATTERN = /^.+_(\d)+\.json$/;

function createSpinners() {
  return {
    params: spinner("📬 gathering parameters"),
    clients: spinner("👾 instantiating clients"),
    s3Read: spinner("🌌 checkihg bucket state"),
    actionsRead: spinner("📃 reading pending logs"),
    s3Write: spinner("🎁 pushing logs")
  };
}

function extractWorkflowRunId({ Key: s3ObjectKey }) {
  return Number(s3ObjectKey.replace(WORKFLOW_RUN_ID_PATTERN, "$1"));
}

function failSpinning(spinners) {
  Object.values(spinners)
    .filter(spinner => spinner.isSpinning)
    .forEach(spinner => spinner.fail());
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
  return [
    "🏁",
    "just pushed",
    count,
    "pending workflow run logs to bucket",
    bucket
  ].join(" ");
}

function toS3ObjectKey(owner, repo, workflow, workflowRun) {
  const date = workflowRun.created_at.slice(0, 10);

  const workflowRunMetaData = [
    workflowRun.event,
    workflowRun.head_branch,
    workflowRun.head_sha,
    workflowRun.id
  ].join("_");

  return join(
    owner,
    repo,
    "workflows",
    workflow.name,
    date,
    `${workflowRunMetaData}.json`
  );
}

module.exports = {
  createSpinners,
  extractWorkflowRunId,
  failSpinning,
  getParams,
  mergeDocs,
  toS3ObjectKey
};
