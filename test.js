// NOTE: this test suite depends on the docker-compose stack

const tape = require("tape");
const S3 = require("aws-sdk/clients/s3");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const S3_ENDPOINT = "http://localhost:4572";

const ENV = {
  ...process.env,
  GITHUB_REPOSITORY: "chiefbiiko/poly1305",
  AWS_REGION: "us-east-1",
  BUCKET: `permalogs3-testing-bucket-${new Date().getTime()}`,
  EXTRA_S3_OPTS: `{"endpoint":"${S3_ENDPOINT}"}`,
  AWS_ACCESS_KEY_ID: "alibaba",
  AWS_SECRET_ACCESS_KEY: "sesameopen"
};

const S3_OBJECT_KEY_PATTERN = new RegExp(
  `${ENV.GITHUB_REPOSITORY}\/workflows\/[^\/]+\/\d{4}-\d{2}-\d{2}` +
    ".+_[a-f0-9]{40}_[a-z-]+_/d+\.json$"
);

const s3 = new S3(
  {
    apiVersion: "2006-03-01",
    endpoint: S3_ENDPOINT,
    params: { Bucket: ENV.BUCKET }
  }
);

tape("syncing to a bucket", async t => {
  await exec("node ./main.js", { env: ENV });

  const { Contents: contents } = await s3.listObjectsV2().promise();

  contents
    .map(content => content.Key)
    .forEach(s3ObjectKey => {
      t.true(S3_OBJECT_KEY_PATTERN.test(s3ObjectKey));
    });

  t.end();
});
