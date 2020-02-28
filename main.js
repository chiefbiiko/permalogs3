const { getInput, setFailed } = require("@actions/core");
const { createActionAuth } = require("@octokit/auth");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");
const { join: pathJoin } = require("path");
const debug = require("debug")("permalogs3")

let s3;
let actions;

// TODO features: pretty-print progress-info like cargo -> mafintosh/diffy

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

function mergeDocs(docs) {
  return docs.reduce((acc, cur) => Object.assign(acc, cur), {});
}

function toS3ObjectKey(owner, repo, workflow, workflowRun) {
  const date = workflowRun.created_at.slice(0, 10);

  const workflowRunMetaData = [
    workflowRun.head_branch,
    workflowRun.head_sha,
    workflowRun.event,
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

async function mkbcktp() {
  try {
    await s3.headBucket().promise();
  } catch (_) {
    await s3.createBucket().promise();
  }
}

async function listStoredWorkflowRunIds() {
  const { Contents: contents } = await s3.listObjectsV2().promise();

  return contents.map(({ Key: key }) => key.split("/").pop());
}

async function listWorkflowRuns(owner, repo, skip) {
  const { data: { workflow_runs } } = await actions
    .listRepoWorkflowRuns({ owner, repo });

  const workflowRuns = await Promise.all(
    workflow_runs
      .filter(workflow_run => !skip.includes(workflow_run.id))
      .map(async workflow_run => {
        const workflow_id = workflow_run.workflow_url.split("/").pop();

        const workflow = await getWorkflow(owner, repo, workflow_id);

        const { data: { jobs } } = await actions
          .listJobsForWorkflowRun({ owner, repo, run_id: workflow_run.id });

        const workflowRunJobLogs = await Promise.all(
          jobs.map(async job => {
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
          s3ObjectKey: toS3ObjectKey(owner, repo, workflow, workflow_run),
          id: workflow_run.id,
          head_branch: workflow_run.head_branch,
          head_sha: workflow_run.head_sha,
          event: workflow_run.event,
          created_at: workflow_run.created_at,
          updated_at: workflow_run.updated_at,
          status: workflow_run.status,
          conclusion: workflow_run.conclusion,
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
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
 
    debug("owner, repo", owner, repo);

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
    
    debug("params", params);

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

    // NOTE: aws credentials must be set in ~/.aws/credentials or env vars
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

    await mkbcktp();

    const skip = await listStoredWorkflowRunIds();

    debug("skip", skip);

    const pending = await listWorkflowRuns(owner, repo, skip);

    debug("pending", pending);

    await batchStore(pending);
  } catch (err) {
    console.error(err.stack);
    setFailed(`[permalogs3 crash] ${err.message}`);
  }
}

main();
