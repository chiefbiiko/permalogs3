const tape = require("tape");
const S3 = require("aws-sdk/clients/s3");
const exec = require("util").promisify(require("child_process").exec);

const S3_OBJECT_KEY_PATTERN = new RegExp(
  `°${process.env.GITHUB_REPOSITORY}\/workflows\/[^\/]+\/\d{4}-\d{2}-\d{2}\/` +
    "[a-z-]+_[^_]+_[a-f0-9]{40}_\d+\.json$"
);

const s3 = new S3(
  {
    apiVersion: "2006-03-01",
    params: { Bucket: process.env.BUCKET }
  }
);

tape("syncing to a bucket", async t => {
  // TODO: count before and after
  
  await exec("node ./main.js");

  const { Contents: items } = await s3.listObjectsV2().promise();

  items
    .forEach(item => {
      t.true(S3_OBJECT_KEY_PATTERN.test(item.Key), "key pattern");
      t.true(item.Size > 0, "item size");
    });

  t.end();
});