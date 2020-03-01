// NOTE: aws credentials must be set in the shared credentials file or env vars

const { setFailed } = require("@actions/core");

const {
  batchStore,
  getWorkflow,
  initClients,
  listStoredWorkflowRunIds,
  listWorkflowRuns,
  mkbcktp
} = require("./curl.js");

const {
  createSpinners,
  failSpinning,
  getParams,
  summary
} = require("./util.js");

const spinners = createSpinners();

async function main() {
  try {
    spinners.params.start();

    const { owner, repo, params } = getParams();

    spinners.params.succeed();
    spinners.clients.start();

    initClients(params);

    spinners.clients.succeed();
    spinners.s3Read.start();

    await mkbcktp();

    const skip = await listStoredWorkflowRunIds(owner, repo);

    spinners.s3Read.succeed();
    spinners.actionsRead.start();

    const pending = await listWorkflowRuns(owner, repo, skip);

    spinners.actionsRead.succeed();

    if (pending.length) {
      spinners.s3Write.start();

      await batchStore(pending);

      spinners.s3Write.succeed();
    }

    console.log(summary(pending.length, params.bucket));
  } catch (err) {
    failSpinning(spinners);

    console.error(err.stack);

    setFailed(err.message);
  }
}

main();
