const fixtures = {
  "merging docs": {
    input: [{ a: { name: "alice", "#": 1 } }, { b: { name: "bob", "#": 2 } }],
    expected: { a: { name: "alice", "#": 1 }, b: { name: "bob", "#": 2 } }
  },
  "constructing a s3 object key prefix": {
    input: { owner: "owner", repo: "repo" },
    expected: "owner/repo/workflow-runs/"
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
    expected: "owner/repo/workflow-runs/ci/2020-02-29/push-master-hash-1.json"
  },
  "cutting a workflow id": {
    input: "https://github.com/chiefbiiko/permalogs3/actions/workflows/419",
    expected: 419
  },
  "extracting a workflow run id from a s3 object key": {
    input: {
      Key: "owner/repo/workflow-runs/ci/2020-02-29/push-master-hash-1.json"
    },
    expected: 1
  },
  "reading pagination info off the link header": {
    input: ' <https://api.github.com/user/repos?page=3&per_page=100>; rel="next", \n <https://api.github.com/user/repos?page=50&per_page=100>; rel="last"',
    expected: { next: 3, last: 50 }
  }
};

module.exports = { fixtures };
