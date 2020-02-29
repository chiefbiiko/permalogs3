const { join: pathJoin } = require("path");

const WORKFLOW_RUN_ID_PATTERN = /^.+_(\d)+\.json$/;

function extractWorkflowRunId({ Key: s3ObjectKey }) {
  return Number(s3ObjectKey.replace(WORKFLOW_RUN_ID_PATTERN, "$1"));
}

function failSpinning(spinners) {
  Object.values(spinners)
    .filter(spinner => spinner.isSpinning())
    .forEach(spinner => spinner.fail());
}

function mergeDocs(docs) {
  return docs.reduce((acc, cur) => Object.assign(acc, cur), {});
}

function toS3ObjectKey(owner, repo, workflow, workflowRun) {
  const date = workflowRun.created_at.slice(0, 10);

  const workflowRunMetaData = [
    workflowRun.event,
    workflowRun.head_branch,
    workflowRun.head_sha,
    workflowRun.id
  ].join("_");

  return pathJoin(
    owner,
    repo,
    "workflows",
    workflow.name,
    date,
    `${workflowRunMetaData}.json`
  );
}

module.exports = {
  extractWorkflowRunId,
  failSpinning,
  mergeDocs,
  toS3ObjectKey
};
