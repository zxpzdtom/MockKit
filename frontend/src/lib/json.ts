export function formatJson(value: string) {
  return JSON.stringify(JSON.parse(value), null, 2);
}

export function getJsonStatus(value: string) {
  if (!value.trim()) return { valid: true, message: "文本" };
  try {
    JSON.parse(value || "");
    return { valid: true, message: "JSON 有效" };
  } catch {
    return { valid: true, message: "文本" };
  }
}

export function lineNumbers(value: string) {
  const count = Math.max(1, (value || "").split("\n").length);
  return Array.from({ length: count }, (_, index) => index + 1);
}
