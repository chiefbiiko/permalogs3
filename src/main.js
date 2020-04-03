// NOTE: aws credentials must be set in the shared credentials file or env vars

const { setFailed } = require("@actions/core");

const {
  getWorkflow,
  initClients,
  listStoredWorkflowRunIds,
  storeWorkflowRuns,
  mkbcktp
} = require("./curl.js");

const { getParams, summary } = require("./util.js");

async function main() {
  try {
    console.log("📬 gathering params");

    const { owner, repo, params } = getParams();

    console.log("👾 instantiating clients");

    initClients(params);

    console.log("🌌 checkihg bucket state");

    await mkbcktp();

    const skip = await listStoredWorkflowRunIds(owner, repo);

    console.log("⬆️ pushing pending logs");

    const stored = await storeWorkflowRuns(owner, repo, skip);

    console.log(summary(stored, params.bucket));
  } catch (err) {
    console.error(err.stack);

    setFailed(err.message);
  }
}

main();
