/** Read-only release guard: published tag -> immutable commit -> all successful source gates. */
import { appendFileSync } from "node:fs";

const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
if (repository !== "Geonhui-Lee/align-dotenv" || !/^v0\.4\.0$/.test(tag ?? "")) throw new Error("Only the explicitly prepared v0.4.0 release is supported; never replay v0.3.x");
const api = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub verification HTTP ${response.status}`);
  return response.json();
};
const release = await api(`releases/tags/${tag}`);
if (release.draft || release.prerelease || !release.published_at || release.tag_name !== tag) throw new Error("An existing published stable GitHub Release is required");
let { object } = await api(`git/ref/tags/${tag}`);
for (let depth = 0; object.type === "tag" && depth < 8; depth++) ({ object } = await api(`git/tags/${object.sha}`));
if (object.type !== "commit" || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error("Tag must resolve to an immutable commit");
const outputs = { commit: object.sha };
for (const [key, workflow] of [["baseline_run", "ci.yml"], ["standalone_run", "executable.yml"], ["npm_run", "npm-executable.yml"]]) {
  const { workflow_runs: runs } = await api(`actions/workflows/${workflow}/runs?head_sha=${object.sha}&event=push&status=success&per_page=100`);
  const run = runs.find((item) => item.head_sha === object.sha && item.conclusion === "success" && item.event === "push");
  if (!run) throw new Error(`Exact tagged commit lacks successful ${workflow} validation`);
  outputs[key] = String(run.id);
}
if (!process.env.GITHUB_OUTPUT) throw new Error("GitHub guard output destination required");
for (const [key, value] of Object.entries(outputs)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
console.log(`Verified published ${tag}, source ${object.sha}, and all three successful source validation runs`);
