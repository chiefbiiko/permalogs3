const { createActionAuth } = require("@octokit/auth-action");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");
const { validate } = require("./schm.js");
const {
  cutWorkflowId,
  extractWorkflowRunId,
  mergeDocs,
  toS3ObjectKey
} = require("./util.js");

let s3;
let octokit;

async function batchStore(pending) {
  return Promise.all(
    pending.map(workflowRun => s3.putObject({
      Key: workflowRun.s3ObjectKey,
      Body: JSON.stringify(workflowRun, null, 2)
    }).promise())
  );
}

const workflowCache = new Map();

async function getWorkflow(owner, repo, workflow_id) {
  const cacheKey = `${owner}${repo}${workflow_id}`;

  if (workflowCache.has(cacheKey)) {
    return workflowCache.get(cacheKey);
  }

  const { data: workflow } = await octokit.actions
    .getWorkflow({ owner, repo, workflow_id });

  const _workflow = {
    ...workflow,
    node_id: undefined,
    url: undefined,
    html_url: undefined,
    badge_url: undefined
  };

  workflowCache.set(cacheKey, _workflow);

  return _workflow;
}

async function initClients(params) {
  s3 = new S3(
    {
      ...params.extraS3Opts,
      apiVersion: "2006-03-01",
      region: params.region,
      params: { ...params.extraS3Params, Bucket: params.bucket }
    }
  );

  const auth = await createActionAuth();
  const { token } = await auth();

  octokit = new Octokit({ auth: token });
}

async function listStoredWorkflowRunIds(owner, repo) {
  const prefix = `${owner}/${repo}/workflow_runs/`;

  const ids = [];

  let res = await s3.listObjectsV2({ Prefix: prefix }).promise();

  Array.prototype.push.apply(ids, res.Contents.map(extractWorkflowRunId));

  while (res.NextContinuationToken) {
    res = await s3.listObjectsV2({
      Prefix: prefix,
      ContinuationToken: res.NextContinuationToken
    }).promise();

    Array.prototype.push.apply(ids, res.Contents.map(extractWorkflowRunId));
  }

  return new Set(ids);
}

async function listWorkflowRuns(owner, repo, skip) {
  // NOTE: the octokit request filter for status "completed" seems to
  // not work with octokit.paginate
  let req = octokit.actions.listRepoWorkflowRuns.endpoint
    .merge({ owner, repo, status: "completed" });

  const workflow_runs = await octokit.paginate(req);

  const workflowRuns = await Promise.all(
    workflow_runs
      .filter(({ id, status }) => status === "completed" && !skip.has(id))
      .map(async workflow_run => {
        const workflowId = cutWorkflowId(workflow_run.workflow_url);

        const workflow = await getWorkflow(owner, repo, workflowId);

        const s3ObjectKey = toS3ObjectKey(owner, repo, workflow, workflow_run);

        req = octokit.actions.listJobsForWorkflowRun.endpoint
          .merge({ owner, repo, run_id: workflow_run.id });

        const jobs = await octokit.paginate(req);

        const workflowRunJobLogs = await Promise.all(
          jobs
            .map(async job => {
              req = octokit.actions.listWorkflowJobLogs.endpoint
                .merge({ owner, repo, job_id: job.id });

              const jobLogs = await octokit.paginate(req);

              return {
                [job.name]: {
                  id: job.id,
                  started_at: job.started_at,
                  completed_at: job.completed_at,
                  status: job.status,
                  conclusion: job.conclusion,
                  logs: jobLogs[0]
                }
              };
            })
        );

        const data = {
          s3ObjectKey,
          id: workflow_run.id,
          head_branch: workflow_run.head_branch,
          head_sha: workflow_run.head_sha,
          event: workflow_run.event,
          created_at: workflow_run.created_at,
          updated_at: workflow_run.updated_at,
          status: workflow_run.status,
          conclusion: workflow_run.conclusion,
          html_url: workflow_run.html_url,
          pull_requests: workflow_run.pull_requests,
          workflow,
          jobs: mergeDocs(workflowRunJobLogs)
        };

        if (!validate(data)) {
          throw new Error("mapped outbound data does not match json schema");
        }

        return data;
      })
  );

  return workflowRuns.flat(1);
}

async function mkbcktp() {
  try {
    await s3.headBucket().promise();
  } catch (_) {
    await s3.createBucket().promise();
  }
}

module.exports = {
  batchStore,
  getWorkflow,
  initClients,
  listStoredWorkflowRunIds,
  listWorkflowRuns,
  mkbcktp
};
