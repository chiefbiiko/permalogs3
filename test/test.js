const tape = require("tape");
const S3 = require("aws-sdk/clients/s3");
const exec = require("util").promisify(require("child_process").exec);
const { fixtures } = require("./fixtures.js");
const { validate } = require("./../src/schm.js");
const {
  cutWorkflowId,
  extractWorkflowRunId,
  failSpinning,
  getPageNumbers,
  mergeDocs,
  toS3ObjectKeyPrefix,
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

// TODO: test getParams

tape("reading pagination info off the link header", t => {
  const { input, expected } = fixtures
    ["reading pagination info off the link header"];

  const actual = getPageNumbers(input);

  t.deepEqual(actual, expected);

  t.end();
});

tape("merging docs", t => {
  const { input, expected } = fixtures["merging docs"];

  const actual = mergeDocs(input);

  t.deepEqual(actual, expected);

  t.end();
});

tape("constructing a s3 object key prefix", t => {
  const { input, expected } = fixtures["constructing a s3 object key prefix"];

  const actual = toS3ObjectKeyPrefix(input.owner, input.repo);

  t.equal(actual, expected);

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

tape("pushing logs to a bucket", { timeout: 20000 }, async t => {
  await emptyBucket();

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec(`node ${main}`);

  const after = await listObjects();

  t.assert(after.length > 0);

  t.assert(after.every(object => object.Size > 100));

  t.end();
});

tape("permalogs3 is idempotent", { timeout: 30000 }, async t => {
  await emptyBucket();

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec(`node ${main}`);
  
  const inbetween = await listObjects();

  t.assert(inbetween.length > 0);

  t.assert(inbetween.every(object => object.Size > 100));

  await exec(`node ${main}`);

  const lastly = await listObjects();

  t.deepEqual(lastly, inbetween);

  t.end();
});

tape("schema validation", async t => {
  const objects = await listObjects();
  
  const { Body: body } = await s3.getObject({ Key: objects[0].Key }).promise();

  t.assert(validate(JSON.parse(body)));

  t.end();
});
