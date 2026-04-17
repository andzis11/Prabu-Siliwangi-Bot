import * as fs from "fs";
import * as path from "path";
import { DEFAULT_APP_CONFIG, mergeConfig } from "./defaultConfig";
import { AppConfig } from "../domain/types";

function resolveProjectRoot(): string {
  return path.resolve(__dirname, "../../../../");
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function resolveUserConfigPath(): string {
  const rootDir = resolveProjectRoot();
  const userPath = path.join(rootDir, "user-config.json");
  const examplePath = path.join(rootDir, "user-config.example.json");

  if (fs.existsSync(userPath)) {
    return userPath;
  }

  return examplePath;
}

export function loadAppConfig(): AppConfig {
  const configPath = resolveUserConfigPath();
  const parsed = readJsonFile(configPath) as Partial<AppConfig>;
  return mergeConfig(DEFAULT_APP_CONFIG, parsed);
}
