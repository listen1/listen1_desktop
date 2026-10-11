const test = require("node:test");
const assert = require("node:assert/strict");
const root = require("../package.json");
const app = require("../app/package.json");

test("packaged updates have an explicit fork feed and preserve installation/version identity", () => {
  assert.deepEqual(root.build.publish, {
    provider: "github",
    owner: "MapleSugarCake",
    repo: "listen1_desktop",
  });
  assert.equal(root.version, app.version);
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.equal(app.name, "listen1");
  assert.equal(root.build.appId, "com.listen1.listen1");
  assert.equal(root.build.productName, "Listen1");
});
