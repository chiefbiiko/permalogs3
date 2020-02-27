const { getInput, setFailed } = require("@actions/core");
const { createActionAuth, createTokenAuth } = require("@octokit/auth");
const { Octokit } = require("@octokit/rest");
const S3 = require("aws-sdk/clients/s3");

let s3;
let actions;

// TODO features: pretty-print progress-info like cargo -> mafintosh/diffy

function toS3ObjectKey (owner, repo, workflowRun) {
  const isoDate = workflow_run.created_at.slice(0, 10);

  return `${owner}/${repo}/workflow_runs/${isoDate}/${workflow_run.id}.json`
}

async function mkbucketp() {
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

async function listWorkflowRuns({ owner, repo }, skip) {
  const { data: { workflow_runs } } = await actions
    .listRepoWorkflowRuns({ owner, repo });

  const workflowRuns = await Promise.all(
    workflow_runs
      .filter(workflow_run => !skip.includes(workflow_run.id))
      .map(async workflow_run => {
        console.error(`>>> workflow_run\n${JSON.stringify(workflow_run, null, 2)}`)
        const { data: { jobs } } = await actions
          .listJobsForWorkflowRun({ owner, repo, run_id: workflow_run.id });

        const workflowJobLogs = await Promise.all(
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
          s3ObjectKey: toS3ObjectKey(owner, repo, workflowRun),
          id: workflow_run.id,
          head_branch: workflow_run.head_branch,
          head_sha: workflow_run.head_sha,
          event: workflow_run.event,
          created_at: workflow_run.created_at,
          updated_at: workflow_run.updated_at,
          status: workflow_run.status,
          conclusion: workflow_run.conclusion,
          pull_requests: workflow_run.pull_requests,
          jobs: workflowJobLogs.reduce(
            (acc, cur) => Object.assign(acc, cur),
            {}
          )
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
    const params = {
      region: getInput("aws_region") || process.env.AWS_REGION ||
        process.env.AWS_DEFAULT_REGION,
      bucket: getInput("bucket") || process.env.BUCKET,
      default_s3_params: JSON.parse(getInput("default_s3_params") || "{}"),
      owner: process.env.TODO || "chiefbiiko",
      repo: process.env.TODO || "poly1305"
    };

    // NOTE: aws credentials must be set in ~/.aws/credentials or env vars
    s3 = new S3(
      {
        apiVersion: "2006-03-01",
        region: params.region,
        params: { ...params.default_s3_params, Bucket: params.bucket }
      }
    );

    // TODO: use createActionAuth()
    const auth = await createTokenAuth(process.env.PERSONAL_ACCESS_TOKEN);
    const { token } = await auth();
    actions = new Octokit({ auth: token }).actions;

    await mkbucketp();

    const skip = await listStoredWorkflowRunIds();

    const pending = await listWorkflowRuns(params, skip);

    await batchStore(pending);
  } catch (err) {
    console.error(err.stack);
    setFailed((err && err.message) || "permalogs3 failed");
  }
}

main();
