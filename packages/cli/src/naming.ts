function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export function toKebabCase(value: string): string {
  return words(value).join("-");
}

export function toCamelCase(value: string): string {
  return words(value)
    .map((word, index) =>
      index === 0 ? word : word[0]!.toUpperCase() + word.slice(1),
    )
    .join("");
}

export function toPascalCase(value: string): string {
  const camel = toCamelCase(value);
  return camel.length === 0 ? camel : camel[0]!.toUpperCase() + camel.slice(1);
}
