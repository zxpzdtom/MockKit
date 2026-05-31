import type { Endpoint } from "@/types";
import JsonToTS from "json-to-ts";

export interface TypeScriptGenerationResult {
  text: string;
  includedCount: number;
  skippedCases: Array<{
    name: string;
    reason: string;
  }>;
}

interface GenerateEndpointTypeScriptOptions {
  caseBodyById?: Record<string, string>;
}

interface ParsedSample {
  caseName: string;
  signature: string;
  value: unknown;
}

interface SampleGroup {
  caseNames: string[];
  samples: unknown[];
  signature: string;
  typeName: string;
}

const ignoredTypeNameWords = new Set([
  "http",
  "https",
  "www",
  "com",
  "cn",
  "net",
  "org",
  "io",
  "json",
  "api",
  "service",
]);
const knownCaseDescriptors = new Map([
  ["default", "Default"],
  ["成功", "Success"],
  ["success", "Success"],
  ["失败", "Failure"],
  ["失敗", "Failure"],
  ["failure", "Failure"],
  ["error", "Failure"],
  ["空数据", "EmptyData"],
  ["空資料", "EmptyData"],
  ["empty", "EmptyData"],
]);

function splitIdentifierWords(value: string) {
  const rawWords = value.match(/[A-Za-z0-9]+/g) ?? [];
  return rawWords.flatMap((word) => word.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [word]);
}

function toPascalCase(words: string[]) {
  return words
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("");
}

function isVersionPathSegment(value: string) {
  return /^v?\d+(?:\.\d+)*$/i.test(value);
}

function stripKnownFileExtension(value: string) {
  return value.replace(/\.(?:json|txt|js|ts)$/i, "");
}

function pathEndpointNameWords(path: string) {
  const pathWithoutQuery = path.split(/[?#]/)[0] ?? path;
  const segments = pathWithoutQuery
    .split("/")
    .map((segment) => stripKnownFileExtension(segment.trim()))
    .filter((segment) => segment && !isVersionPathSegment(segment));

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const parts = segments[index]
      .split(".")
      .map((part) => part.trim())
      .filter((part) => part && !isVersionPathSegment(part));
    const tail = parts[parts.length - 1] ?? segments[index];
    const words = splitIdentifierWords(tail).filter((word) => !ignoredTypeNameWords.has(word.toLowerCase()));
    if (words.length > 0) return words;
  }

  return [];
}

function endpointResponseTypeName(endpoint: Endpoint) {
  const pathWords = pathEndpointNameWords(endpoint.overridePath);
  const nameWords = splitIdentifierWords(endpoint.name).filter(
    (word) => !ignoredTypeNameWords.has(word.toLowerCase()),
  );
  const words = pathWords.length > 0 ? pathWords : nameWords;
  const typeName = toPascalCase(words.length > 0 ? words : ["Mock", "Response"]);
  const legalTypeName = /^[A-Za-z_]/.test(typeName) ? typeName : `Mock${typeName}`;
  return /Response$/i.test(legalTypeName) ? legalTypeName : `${legalTypeName}Response`;
}

function topLevelSignature(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  return `object:${Object.keys(value).sort().join("|")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function caseDescriptor(caseName: string, index: number) {
  const trimmed = caseName.trim();
  const knownDescriptor =
    knownCaseDescriptors.get(trimmed.toLowerCase()) ?? knownCaseDescriptors.get(trimmed);
  if (knownDescriptor) return knownDescriptor;

  const words = splitIdentifierWords(trimmed);
  if (words.length > 0) return toPascalCase(words);
  return `Scenario${index + 1}`;
}

function groupedResponseTypeName(baseTypeName: string, group: Pick<SampleGroup, "caseNames">, index: number) {
  const stem = baseTypeName.replace(/Response$/i, "");
  const descriptor = caseDescriptor(group.caseNames[0] ?? "", index);
  const suffix = group.caseNames.length > 1 ? `${descriptor}Variants` : descriptor;
  return `${stem}${suffix}Response`;
}

function caseBody(endpoint: Endpoint, caseId: string, options: GenerateEndpointTypeScriptOptions) {
  return options.caseBodyById?.[caseId] ?? endpoint.cases.find((item) => item.id === caseId)?.body ?? "";
}

function groupSamples(samples: ParsedSample[], baseTypeName: string) {
  const groupsBySignature = new Map<string, SampleGroup>();

  for (const sample of samples) {
    const existing = groupsBySignature.get(sample.signature);
    if (existing) {
      existing.caseNames.push(sample.caseName);
      existing.samples.push(sample.value);
      continue;
    }

    groupsBySignature.set(sample.signature, {
      caseNames: [sample.caseName],
      samples: [sample.value],
      signature: sample.signature,
      typeName: "",
    });
  }

  const groups = [...groupsBySignature.values()];
  for (const [index, group] of groups.entries()) {
    group.typeName = groups.length === 1 ? baseTypeName : groupedResponseTypeName(baseTypeName, group, index);
  }
  return groups;
}

function primitiveType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const itemTypes = [...new Set(value.map(primitiveType))].sort();
    return `Array<${itemTypes.length > 0 ? itemTypes.join(" | ") : "unknown"}>`;
  }
  if (typeof value === "object") return "Record<string, unknown>";
  return typeof value;
}

function primitiveUnionType(values: unknown[]) {
  return [...new Set(values.map(primitiveType))].sort().join(" | ");
}

function normalizeGeneratedTypeScript(lines: string[]) {
  return lines
    .join("\n")
    .replace(/^type /gm, "export type ")
    .replace(/\bany\[\]/g, "unknown[]")
    .replace(/export type ([A-Za-z_$][\w$]*) = \{\n\}/g, "export type $1 = Record<string, unknown>;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scopedTypePrefix(group: SampleGroup) {
  return group.typeName.replace(/Response$/i, "");
}

function scopeGeneratedTypeNames(source: string, group: SampleGroup, preservedNames = [group.typeName]) {
  const preserved = new Set(preservedNames);
  const prefix = scopedTypePrefix(group);
  const typeNames = [...source.matchAll(/^export type ([A-Za-z_$][\w$]*)\b/gm)]
    .map((match) => match[1])
    .filter((typeName): typeName is string => Boolean(typeName))
    .filter((typeName) => !preserved.has(typeName))
    .sort((left, right) => right.length - left.length);

  let scopedSource = source;
  for (const typeName of typeNames) {
    const scopedName = typeName.startsWith(prefix) ? typeName : `${prefix}${typeName}`;
    scopedSource = scopedSource.replace(new RegExp(`\\b${escapeRegExp(typeName)}\\b`, "g"), scopedName);
  }
  return scopedSource;
}

function jsonToTsInputForObjectGroup(group: SampleGroup) {
  if (group.signature.startsWith("object:")) {
    return group.samples.length === 1 ? group.samples[0] : group.samples;
  }

  return null;
}

function generatedTypeScriptForGroup(
  jsonToTs: (json: unknown, options: { rootName: string; useTypeAlias: boolean }) => string[],
  group: SampleGroup,
) {
  const objectInput = jsonToTsInputForObjectGroup(group);
  if (objectInput != null) {
    return scopeGeneratedTypeNames(
      normalizeGeneratedTypeScript(
        jsonToTs(objectInput, {
          rootName: group.typeName,
          useTypeAlias: true,
        }),
      ),
      group,
    );
  }

  if (group.signature === "array") {
    const items = group.samples.flatMap((sample) => (Array.isArray(sample) ? sample : []));
    if (items.length > 0 && items.every(isPlainObject)) {
      const itemTypeName = `${group.typeName.replace(/Response$/i, "")}Item`;
      return [
        `export type ${group.typeName} = ${itemTypeName}[];`,
        scopeGeneratedTypeNames(
          normalizeGeneratedTypeScript(
            jsonToTs(items, {
              rootName: itemTypeName,
              useTypeAlias: true,
            }),
          ),
          group,
          [group.typeName, itemTypeName],
        ),
      ].join("\n\n");
    }
  }

  return `export type ${group.typeName} = ${primitiveUnionType(group.samples)};`;
}

export async function generateEndpointTypeScript(
  endpoint: Endpoint,
  options: GenerateEndpointTypeScriptOptions = {},
): Promise<TypeScriptGenerationResult> {
  const parsedSamples: ParsedSample[] = [];
  const skippedCases: TypeScriptGenerationResult["skippedCases"] = [];

  for (const [index, mockCase] of endpoint.cases.entries()) {
    const caseName = mockCase.name || `场景 ${index + 1}`;
    const body = caseBody(endpoint, mockCase.id, options).trim();
    if (!body) {
      skippedCases.push({ name: caseName, reason: "响应体为空" });
      continue;
    }

    try {
      const parsed = JSON.parse(body);
      parsedSamples.push({
        caseName,
        signature: topLevelSignature(parsed),
        value: parsed,
      });
    } catch {
      skippedCases.push({ name: caseName, reason: "不是有效 JSON" });
    }
  }

  if (parsedSamples.length === 0) {
    throw new Error("没有可用于生成 TypeScript 的有效 JSON 场景。");
  }

  const topLevelName = endpointResponseTypeName(endpoint);
  const groups = groupSamples(parsedSamples, topLevelName);
  const generatedTypes = groups.map((group) => generatedTypeScriptForGroup(JsonToTS, group)).join("\n\n");

  const header = [
    `// Generated from MockKit: ${endpoint.method.toUpperCase()} ${endpoint.overridePath}`,
    `// Scenarios: ${parsedSamples.map((sample) => sample.caseName).join(", ")}`,
  ];
  const unionType =
    groups.length > 1
      ? `export type ${topLevelName} =\n${groups.map((group) => `  | ${group.typeName}`).join("\n")};\n\n`
      : "";

  return {
    text: `${header.join("\n")}\n\n${unionType}${generatedTypes}\n`,
    includedCount: parsedSamples.length,
    skippedCases,
  };
}
