var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { spawn } from "child_process";
import { EventEmitter } from "events";
import path, { join } from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var AudioTee = class {
  constructor(options = {}) {
    __publicField(this, "events", new EventEmitter());
    __publicField(this, "process", null);
    __publicField(this, "isRunning", false);
    __publicField(this, "options");
    this.options = options;
  }
  on(event, listener) {
    this.events.on(event, listener);
    return this;
  }
  once(event, listener) {
    this.events.once(event, listener);
    return this;
  }
  off(event, listener) {
    this.events.off(event, listener);
    return this;
  }
  removeAllListeners(event) {
    this.events.removeAllListeners(event);
    return this;
  }
  emit(event, ...args) {
    return this.events.emit(event, ...args);
  }
  buildArguments() {
    const args = [];
    if (this.options.sampleRate !== void 0) {
      args.push("--sample-rate", this.options.sampleRate.toString());
    }
    if (this.options.chunkDurationMs !== void 0) {
      args.push("--chunk-duration", (this.options.chunkDurationMs / 1e3).toString());
    }
    if (this.options.mute) {
      args.push("--mute");
    }
    if (this.options.includeProcesses && this.options.includeProcesses.length > 0) {
      args.push("--include-processes", ...this.options.includeProcesses.map((p) => p.toString()));
    }
    if (this.options.excludeProcesses && this.options.excludeProcesses.length > 0) {
      args.push("--exclude-processes", ...this.options.excludeProcesses.map((p) => p.toString()));
    }
    return args;
  }
  handleStderr(data) {
    const text = data.toString("utf8");
    const lines = text.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      try {
        const logMessage = JSON.parse(line);
        if (logMessage.message_type === "debug" || logMessage.message_type === "info") {
          this.emit("log", logMessage.message_type, logMessage.data);
        }
        if (logMessage.message_type === "stream_start") {
          this.emit("start");
        } else if (logMessage.message_type === "stream_stop") {
          this.emit("stop");
        } else if (logMessage.message_type === "error") {
          this.emit("error", new Error(logMessage.data.message));
        }
      } catch (parseError) {
        console.error("Error parsing log message:", parseError);
      }
    }
  }
  start() {
    return new Promise((resolve, reject) => {
      var _a, _b;
      if (this.isRunning) {
        reject(new Error("AudioTee is already running"));
        return;
      }
      if (process.platform !== "darwin") {
        reject(new Error(`AudioTee currently only supports macOS (darwin). Current platform: ${process.platform}`));
        return;
      }
      const binaryPath = this.options.binaryPath ?? join(__dirname, "..", "bin", "audiotee");
      const args = this.buildArguments();
      this.process = spawn(binaryPath, args);
      this.process.on("error", (error) => {
        this.isRunning = false;
        this.emit("error", error);
        reject(error);
      });
      this.process.on("exit", (code, signal) => {
        this.isRunning = false;
        if (code !== 0 && code !== null) {
          const error = new Error(`AudioTee process exited with code ${code}`);
          this.emit("error", error);
        }
      });
      (_a = this.process.stdout) == null ? void 0 : _a.on("data", (data) => {
        this.emit("data", { data });
      });
      (_b = this.process.stderr) == null ? void 0 : _b.on("data", (data) => {
        this.handleStderr(data);
      });
      this.isRunning = true;
      resolve();
    });
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.process) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        if (this.process && this.isRunning) {
          this.process.kill("SIGKILL");
        }
      }, 5e3);
      this.process.once("exit", () => {
        clearTimeout(timeout);
        this.isRunning = false;
        this.process = null;
        resolve();
      });
      this.process.kill("SIGTERM");
    });
  }
  isActive() {
    return this.isRunning;
  }
};
export {
  AudioTee
};
