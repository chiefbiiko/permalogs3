// NOTE: aws credentials must be set in the shared credentials file or env vars

const { getInput, setFailed } = require("@actions/core");
const { createActionAuth } = require("@octokit/auth-action");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");
const spinner = require('ora');
const {
  extractWorkflowRunId,
  failSpinning,
  mergeDocs,
  toS3ObjectKey
} = require("./util.js");

let s3;
let actions;

const spinners = {
  params: spinner("gathering parameters"),
  clients: spinner("instantiating clients"),
  s3Read: spinner("reading bucket state"),
  actionsRead: spinner("reading pending logs"),
  s3Write: spinner("pushing logs")
}

const workflowCache = new Map();

async function getWorkflow(owner, repo, workflow_id) {
  const cacheKey = `${owner}${repo}${workflow_id}`;

  if (workflowCache.has(cacheKey)) {
    return workflowCache.get(cacheKey);
  }

  const { data: workflow } = await actions
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

async function mkbcktp() {
  try {
    await s3.headBucket().promise();
  } catch (_) {
    await s3.createBucket().promise();
  }
}

async function listStoredWorkflowRunIds() {
  const { Contents: contents } = await s3.listObjectsV2().promise();

  return contents.map(extractWorkflowRunId);
}

async function listWorkflowRuns(owner, repo, skip) {
  const { data: { workflow_runs } } = await actions
    .listRepoWorkflowRuns({ owner, repo });

  const workflowRuns = await Promise.all(
    workflow_runs
      .filter(workflow_run => !skip.includes(workflow_run.id))
      .map(async workflow_run => {
        const s3ObjectKey = toS3ObjectKey(owner, repo, workflow, workflow_run);

        const workflow_id = workflow_run.workflow_url.split("/").pop();

        const workflow = await getWorkflow(owner, repo, workflow_id);

        const { data: { jobs } } = await actions
          .listJobsForWorkflowRun({ owner, repo, run_id: workflow_run.id });

        const workflowRunJobLogs = await Promise.all(
          jobs
            .filter(job => job.status !== "in_progress")
            .map(async job => {

              const { data: jobLogs } = await actions
                .listWorkflowJobLogs({ owner, repo, job_id: job.id });

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

async function batchStore(pending) {
  return Promise.all(
    pending.map(workflowRun => s3.putObject({
      Key: workflowRun.s3ObjectKey,
      Body: JSON.stringify(workflowRun, null, 2)
    }).promise())
  );
}

async function main() {
  try {
    spinners.params.start();
    
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

    spinners.params.succeed();
    spinners.clients.start();

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
    actions = new Octokit({ auth: token }).actions;

    spinners.clients.succeed();
    spinners.s3Read.start();

    await mkbcktp();

    const skip = await listStoredWorkflowRunIds();
    
    spinners.s3Read.succeed();
    spinners.actionsRead.start()

    const pending = await listWorkflowRuns(owner, repo, skip);
    
    spinners.actionsRead.succeed();
    spinners.s3Write.start()

    await batchStore(pending);
    
    spinners.s3Write.succeed();
    // just pushed $pending pending workflow run logs to $params.bucket
    // total object count is now $skip + $pending
  } catch (err) {
    failSpinning(spinners);
    
    setFailed(err.message);
  }
}

main();
