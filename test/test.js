const tape = require("tape");
const S3 = require("aws-sdk/clients/s3");
const exec = require("util").promisify(require("child_process").exec);
const { fixtures } = require("./fixtures.js")
const {
  extractWorkflowRunId,
  failSpinning,
  mergeDocs,
  toS3ObjectKey
} = require("./../util.js");

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

tape("extracting a workflow run id from a s3 object key", t => {
  const { input, expected } = fixtures
    ["extracting a workflow run id from a s3 object key"];

  const actual = extractWorkflowRunId(input);

  t.equal(actual, expected);

  t.end();
});

tape("pushing logs to a bucket", async t => {
  const old = await listObjects();

  await Promise.all(old.map(object => s3.deleteObject({ Key: object.Key })));

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec("node ./main.js");

  const after = await listObjects();

  t.assert(after.length > 0);

  after.forEach(object => t.assert(object.Size > 0, "object size"));

  t.end();
});

tape("permalogs3 is idempotent", async t => {
  const old = await listObjects();

  await Promise.all(old.map(object => s3.deleteObject({ Key: object.Key })));

  const before = await listObjects();

  t.equal(before.length, 0);

  await exec("node ./main.js");
  
  const inbetween = await listObjects();

  t.assert(inbetween.length > 0);
  
  inbetween.forEach(object => t.assert(object.Size > 0, "object size"));
  
  await exec("node ./main.js");

  const lastly = await listObjects();

  t.equal(lastly, inbetween);

  lastly.forEach(object => t.assert(object.Size > 0, "object size"));

  t.end();
});