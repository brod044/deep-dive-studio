import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const studioDir = join(root, ".studio");
const pidFile = join(studioDir, "ui-process.json");
const stdoutFile = join(studioDir, "ui.stdout.log");
const stderrFile = join(studioDir, "ui.stderr.log");

function readProcessState(path) {
  const bytes = readFileSync(path);
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString("utf16le")
      : bytes.toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requestedPort() {
  const index = process.argv.findIndex((arg) => /^(?:--port|-port)$/i.test(arg));
  const candidate = index >= 0 ? process.argv[index + 1] : process.env.PORT;
  const port = Number(candidate ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${candidate}`);
  }
  return port;
}

async function waitForStudio(port, child) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/state`);
      if (response.ok) return true;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

mkdirSync(studioDir, { recursive: true });
if (existsSync(pidFile)) {
  try {
    const existing = readProcessState(pidFile);
    if ((!existing.root || existing.root === root) && processIsRunning(existing.pid)) {
      console.log(`Deep Dive Studio is already running (PID ${existing.pid}).`);
      console.log(`http://127.0.0.1:${existing.port ?? 8787}`);
      process.exit(0);
    }
  } catch {
    // A stale or partial state file is replaced below.
  }
}

const port = requestedPort();
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
if (!existsSync(tsxCli)) throw new Error("Dependencies are missing. Run npm install first.");

const stdout = openSync(stdoutFile, "a");
const stderr = openSync(stderrFile, "a");
const child = spawn(process.execPath, [tsxCli, join(root, "src", "server.ts")], {
  cwd: root,
  detached: true,
  windowsHide: true,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", stdout, stderr],
});
child.unref();
closeSync(stdout);
closeSync(stderr);

writeFileSync(
  pidFile,
  `${JSON.stringify({ pid: child.pid, port, root, startedAt: new Date().toISOString() }, null, 2)}\n`
);

if (!(await waitForStudio(port, child))) {
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    // The child already exited.
  }
  rmSync(pidFile, { force: true });
  throw new Error(`Studio did not become ready. Check ${stderrFile}`);
}

console.log(`Deep Dive Studio started (PID ${child.pid}).`);
console.log(`http://127.0.0.1:${port}`);
console.log(`Logs: ${studioDir}`);
