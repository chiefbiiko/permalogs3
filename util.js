const { join: pathJoin } = require("path");

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

module.exports = { mergeDocs, toS3ObjectKey };