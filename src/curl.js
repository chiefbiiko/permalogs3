// TODO: handle pagination for s3/actions.list*

const { createActionAuth } = require("@octokit/auth-action");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");

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
  const { Contents: contents } = await s3
    .listObjectsV2({ Prefix: `${owner}/${repo}/workflow_runs/` }).promise();

  return contents.map(extractWorkflowRunId);
}

async function listWorkflowRuns(owner, repo, skip) {
  // const { data: { workflow_runs } } = await actions
  //   .listRepoWorkflowRuns({ owner, repo, status: "completed" });
  
  let req = octokit.actions.listRepoWorkflowRuns.endpoint
    .merge({ owner, repo, status: "completed" });

  // const { data: { workflow_runs } } = await octokit.paginate(req);
  const workflow_runs = await octokit.paginate(req);

  const workflowRuns = await Promise.all(
    workflow_runs
      .filter(workflow_run => !skip.includes(workflow_run.id))
      .map(async workflow_run => {
        const workflowId = cutWorkflowId(workflow_run.workflow_url);

        const workflow = await getWorkflow(owner, repo, workflowId);

        const s3ObjectKey = toS3ObjectKey(owner, repo, workflow, workflow_run);

        // const { data: { jobs } } = await actions
        //   .listJobsForWorkflowRun({ owner, repo, run_id: workflow_run.id });
        
        req = octokit.actions.listJobsForWorkflowRun.endpoint
          .merge({ owner, repo, run_id: workflow_run.id });
        
        // const { data: { jobs } } = await octokit.paginate(req);
        const jobs = await octokit.paginate(req);

        const workflowRunJobLogs = await Promise.all(
          jobs
            .map(async job => {
              // const { data: jobLogs } = await actions
              //   .listWorkflowJobLogs({ owner, repo, job_id: job.id });
              
              req = octokit.actions.listWorkflowJobLogs.endpoint
                .merge({ owner, repo, job_id: job.id })

              // const { data: jobLogs } = await octokit.paginate(req);
              const jobLogs = await octokit.paginate(req);
              
              console.error(">>>>>>> jobLogs", JSON.stringify(jobLogs));

              return {
                [job.name]: {
                  id: job.id,
                  started_at: job.started_at,
                  completed_at: job.completed_at,
                  status: job.status,
                  conclusion: job.conclusion,
                  logs: jobLogs
                }
              };
            })
        );

        return {
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
