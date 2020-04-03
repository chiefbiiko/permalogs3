const { createActionAuth } = require("@octokit/auth-action");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");
const { validate } = require("./schm.js");
const {
  cutWorkflowId,
  extractWorkflowRunId,
  getPageNumbers,
  mergeDocs,
  toS3ObjectKeyPrefix,
  toS3ObjectKey
} = require("./util.js");

let s3;
let octokit;

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
  const prefix = toS3ObjectKeyPrefix(owner, repo);

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

function createRepoWorkflowRunsAit(owner, repo) {
  return {
    _nextPage: 1,
    _lastPage: 0,
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      if (!this._nextPage) {
        return { value: [], done: true };
      }

      // is the status filter flaky?
      const { headers: { link }, data: { workflow_runs } } = await octokit
        .actions
        .listRepoWorkflowRuns(
          { owner, repo, status: "completed", page: this._nextPage }
        );

      const { next, last } = getPageNumbers(link);

      this._nextPage = next;
      this._lastPage = last;

      return { value: workflow_runs, done: false };
    }
  };
}

async function storeWorkflowRuns(owner, repo, skip) {
  let stored = 0;

  for await (const workflow_runs of createRepoWorkflowRunsAit(owner, repo)) {
    await Promise.all(
      workflow_runs
        .filter(({ id, status }) => status === "completed" && !skip.has(id))
        .map(async workflow_run => {
          const workflowId = cutWorkflowId(workflow_run.workflow_url);

          const workflow = await getWorkflow(owner, repo, workflowId);

          const s3ObjectKey = toS3ObjectKey(
            owner,
            repo,
            workflow,
            workflow_run
          );

          const reqOpts = octokit.actions.listJobsForWorkflowRun.endpoint
            .merge({ owner, repo, run_id: workflow_run.id });

          const jobs = await octokit.paginate(reqOpts);

          const workflowRunJobLogs = await Promise.all(
            jobs
              .filter(({ status }) => status === "completed")
              .map(async job => {
                // NOTE: not paginating here bc we r consuming a single 
                // text/plain file here via a github api redirect
                const { data: logs } = await octokit.actions
                  .listWorkflowJobLogs({ owner, repo, job_id: job.id })
                  // if job logs cannot be found we store an empty string
                  .catch(err => {
                    if (err.status === 404) {
                      return { data: "" }
                    }
                
                    throw err
                  });

                return {
                  [job.name]: {
                    id: job.id,
                    started_at: job.started_at,
                    completed_at: job.completed_at,
                    status: job.status,
                    conclusion: job.conclusion,
                    logs
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

          await s3.putObject({
            Key: data.s3ObjectKey,
            Body: JSON.stringify(data, null, 2)
          }).promise();
        })
    );

    stored += workflow_runs.length;
  }

  return stored;
}

async function mkbcktp() {
  try {
    await s3.headBucket().promise();
  } catch (_) {
    await s3.createBucket().promise();
  }
}

module.exports = {
  getWorkflow,
  initClients,
  listStoredWorkflowRunIds,
  storeWorkflowRuns,
  mkbcktp
};
