#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const chromeRoot =
  process.env.CHROME_USER_DATA_DIR ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome");

const knownOverrideKeys = [
  "persistenceNetworkOverridesEnabled",
  "persistence-network-overrides-enabled",
  "persistenceNetworkOverridesDisabled",
  "persistence-network-overrides-disabled",
  "persistenceNetworkOverridesProjectPath",
  "persistence-network-overrides-project-path",
  "persistenceNetworkOverridesProjectPaths",
  "persistence-network-overrides-project-paths",
  "network.enableLocalOverrides",
  "enableLocalOverrides",
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function normalizeDevtoolsValue(value) {
  if (value === true || value === false || value == null) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function walk(value, visitor, pathParts = []) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const next = [...pathParts, key];
    visitor(key, child, next);
    walk(child, visitor, next);
  }
}

function findProfileDirs(root, localState) {
  const candidates = new Set();
  const lastUsed = localState?.profile?.last_used;
  const active = localState?.profile?.last_active_profiles || [];
  if (lastUsed) candidates.add(lastUsed);
  for (const profile of active) candidates.add(profile);
  candidates.add("Default");

  try {
    for (const name of fs.readdirSync(root)) {
      const preferences = path.join(root, name, "Preferences");
      if (fs.existsSync(preferences)) candidates.add(name);
    }
  } catch {}

  return [...candidates].filter((name) =>
    fs.existsSync(path.join(root, name, "Preferences"))
  );
}

function inspectProfile(root, name) {
  const preferencesPath = path.join(root, name, "Preferences");
  const preferences = readJson(preferencesPath);
  const devtoolsPreferences = preferences?.devtools?.preferences || {};
  const matched = {};

  for (const key of knownOverrideKeys) {
    if (Object.prototype.hasOwnProperty.call(devtoolsPreferences, key)) {
      matched[`devtools.preferences.${key}`] = normalizeDevtoolsValue(devtoolsPreferences[key]);
    }
  }

  walk(preferences?.devtools || {}, (key, value, parts) => {
    const joined = parts.join(".");
    if (/override|persistence|filesystem|fileSystem/i.test(joined)) {
      const normalized = normalizeDevtoolsValue(value);
      if (typeof normalized !== "object" || normalized === null) {
        matched[`devtools.${joined}`] = normalized;
      }
    }
  });

  const enabled = normalizeDevtoolsValue(
    devtoolsPreferences.persistenceNetworkOverridesEnabled ??
      devtoolsPreferences["persistence-network-overrides-enabled"]
  );

  return {
    profile: name,
    preferencesPath,
    enableLocalOverrides:
      enabled === true ? "enabled" : enabled === false ? "disabled" : "unknown",
    raw: matched,
  };
}

function main() {
  const localState = readJson(path.join(chromeRoot, "Local State"));
  const profiles = findProfileDirs(chromeRoot, localState);
  const result = {
    chromeRoot,
    lastUsedProfile: localState?.profile?.last_used || null,
    profiles: profiles.map((profile) => inspectProfile(chromeRoot, profile)),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
