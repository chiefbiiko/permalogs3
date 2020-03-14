const Ajv = require("ajv");

const validate = new Ajv().compile({
  type: "object",
  properties: {
    s3ObjectKey: {
      type: "string",
      pattern: "^[^\\s]+\\/[^\\s]+\\/workflow-runs\\/[^\\s]+\\/\\d\\d\\d\\d-\\d\\d-\\d\\d\\/[^\\s]+-[^\\s]+-[a-f0-9]{40}-\\d+\.json$"
    },
    id: { type: "integer" },
    head_branch: { type: "string", minLength: 1 },
    head_sha: { type: "string", pattern: "^[0-9a-f]{40}$" },
    event: { type: "string", minLength: 1 },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["completed"] },
    conclusion: { type: "string", enum: ["failure", "success"] },
    html_url: { type: "string", format: "uri" },
    pull_requests: { type: "array", items: { type: "object" } },
    workflow: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
        state: { type: "string", enum: ["active", "inactive"] },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" }
      }
    },
    jobs: {
      type: "object",
      patternProperties: {
        ".+": {
          type: "object",
          properties: {
            id: { type: "integer" },
            started_at: { type: "string", format: "date-time" },
            completed_at: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["completed"] },
            conclusion: { type: "string", enum: ["failure", "success"] },
            logs: { type: "string" }
          }
        }
      },
      additionalProperties: false
    }
  }
});

module.exports = { validate };
