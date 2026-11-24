import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "apps/api");
const webDir = path.join(rootDir, "apps/web");
const apiEntry = path.join(apiDir, "dist/main.js");
const nextBin = path.join(webDir, "node_modules/.bin/next");
const isProd = process.argv.includes("--prod");
const apiPort = process.env.API_PORT || "4100";

if (!fs.existsSync(apiEntry)) {
  console.log("[dev] Building @coffee/api...");
  const build = spawnSync("npm", ["run", "build", "--workspace", "@coffee/api"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const children = [];
let shuttingDown = false;

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // ignore
      }
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => shutdown("SIGTERM"));

const apiChild = spawn(process.execPath, [apiEntry], {
  cwd: apiDir,
  env: { ...process.env, API_PORT: apiPort },
  stdio: "inherit",
});
children.push(apiChild);

const nextArgs = isProd
  ? ["start", "-p", "3000", "-H", "0.0.0.0"]
  : ["dev", "-p", "3000", "-H", "0.0.0.0"];

const webChild = spawn(nextBin, nextArgs, {
  cwd: webDir,
  env: { ...process.env, API_PORT: apiPort, PORT: "3000" },
  stdio: "inherit",
});
children.push(webChild);

function onChildExit(name, code, signal) {
  if (!shuttingDown) {
    console.error(`[dev] ${name} exited (code=${code}, signal=${signal})`);
    shutdown("SIGTERM");
    process.exit(code ?? 1);
  }
}

apiChild.on("exit", (code, signal) => onChildExit("api", code, signal));
webChild.on("exit", (code, signal) => onChildExit("web", code, signal));
