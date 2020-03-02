// NOTE: aws credentials must be set in the shared credentials file or env vars

const { setFailed } = require("@actions/core");

const {
  getWorkflow,
  initClients,
  listStoredWorkflowRunIds,
  storeWorkflowRuns,
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
    spinners.fetch.start();

    await mkbcktp();

    const skip = await listStoredWorkflowRunIds(owner, repo);

    spinners.fetch.succeed();
    spinners.push.start();

    const stored = await storeWorkflowRuns(owner, repo, skip);

    spinners.push.succeed();

    console.log(summary(stored, params.bucket));
  } catch (err) {
    failSpinning(spinners);

    console.error(err.stack);

    setFailed(err.message);
  }
}

main();
