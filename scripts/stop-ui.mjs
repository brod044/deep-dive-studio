import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(root, ".studio", "ui-process.json");

function readProcessState(path) {
  const bytes = readFileSync(path);
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString("utf16le")
      : bytes.toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

if (!existsSync(pidFile)) {
  console.log("Deep Dive Studio is not running (no process file).");
  process.exit(0);
}

let state;
try {
  state = readProcessState(pidFile);
} catch {
  console.error(`Could not read the process file: ${pidFile}`);
  console.error("Confirm the server is stopped, then remove that file and try again.");
  process.exit(1);
}

if ((state.root && state.root !== root) || !Number.isInteger(state.pid) || state.pid <= 0) {
  throw new Error("Refusing to stop a process from an invalid or different workspace state file.");
}

try {
  process.kill(state.pid, "SIGTERM");
  console.log(`Deep Dive Studio stopped (PID ${state.pid}).`);
} catch (error) {
  if (error?.code !== "ESRCH") throw error;
  console.log("Deep Dive Studio was already stopped.");
} finally {
  rmSync(pidFile, { force: true });
}
