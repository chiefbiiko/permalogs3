const tape = require("tape");
const S3 = require("aws-sdk/clients/s3");
const exec = require("util").promisify(require("child_process").exec);
const { fixtures } = require("./fixtures.js");
const {
  cutWorkflowId,
  extractWorkflowRunId,
  failSpinning,
  mergeDocs,
  toS3ObjectKey
} = require("./../src/util.js");

const main = `${__dirname}/../src/main.js`;

const s3 = new S3(
  {
    apiVersion: "2006-03-01",
    params: { Bucket: process.env.BUCKET }
  }
);

async function listObjects() {
  const { Contents } = await s3.listObjectsV2().promise();

  return Contents;
}

async function emptyBucket() {
  const old = await listObjects();

  return Promise.all(
    old.map(object => s3.deleteObject({ Key: object.Key }).promise())
  );
}

tape("merging docs", t => {
  const { input, expected } = fixtures["merging docs"];

  const actual = mergeDocs(input);

  t.deepEqual(actual, expected);

  t.end();
});

tape("constructing a s3 object key", t => {
  const { input, expected } = fixtures["constructing a s3 object key"];

  const actual = toS3ObjectKey(
    input.owner,
    input.repo,
    input.workflow,
    input.workflowRun
  );

  t.equal(actual, expected);

  t.end();
});

tape("cutting a workflow id", t => {
  const { input, expected } = fixtures["cutting a workflow id"];

  const actual = cutWorkflowId(input);

  t.equal(actual, expected);

  t.end();
});

tape("extracting a workflow run id from a s3 object key", t => {
  const { input, expected } = fixtures
    ["extracting a workflow run id from a s3 object key"];

  const actual = extractWorkflowRunId(input);

  t.equal(actual, expected);

  t.end();
});

tape("pushing logs to a bucket", { timeout: 10000 }, async t => {
  await emptyBucket();

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec(`node ${main}`);

  const after = await listObjects();

  t.assert(after.length > 0);

  after.forEach(object => t.assert(object.Size > 0));

  t.end();
});

tape("permalogs3 is idempotent", { timeout: 10000 }, async t => {
  await emptyBucket();

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec(`node ${main}`);

  const inbetween = await listObjects();

  t.assert(inbetween.length > 0);

  inbetween.forEach(object => t.assert(object.Size > 0));

  await exec(`node ${main}`);

  const lastly = await listObjects();

  t.deepEqual(lastly, inbetween);

  t.end();
});
