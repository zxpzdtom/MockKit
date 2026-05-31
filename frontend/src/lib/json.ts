export function formatJson(value: string) {
  return JSON.stringify(JSON.parse(value), null, 2);
}

export function getJsonStatus(value: string) {
  if (!value.trim()) return { valid: true, kind: "text" as const };
  try {
    JSON.parse(value || "");
    return { valid: true, kind: "json" as const };
  } catch {
    return { valid: true, kind: "text" as const };
  }
}

export function lineNumbers(value: string) {
  const count = Math.max(1, (value || "").split("\n").length);
  return Array.from({ length: count }, (_, index) => index + 1);
}
