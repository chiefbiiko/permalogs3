const fixtures = {
  "merging docs": {
    input: [{ a: { name: "alice", "#": 1 } }, { b: { name: "bob", "#": 2 } }],
    expected: { a: { name: "alice", "#": 1 }, b: { name: "bob", "#": 2 } }
  },
  "constructing a s3 object key": {
    input: {
      owner: "owner",
      repo: "repo",
      workflow: { name: "ci" },
      workflowRun: {
        created_at: "2020-02-29T06:20:25.101Z",
        event: "push",
        head_branch: "master",
        head_sha: "hash",
        id: 1
      }
    },
    expected: "owner/repo/workflows/ci/2020-02-29/push_master_hash_1.json"
  },
  "extracting a workflow run id from a s3 object key": {
    input: {
      Key: "owner/repo/workflows/ci/2020-02-29/push_master_hash_1.json"
    },
    expected: 1
  }
};

module.exports = { fixtures };