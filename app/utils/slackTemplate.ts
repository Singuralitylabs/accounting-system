// Pure placeholder expansion / validation for editable Slack message templates, shared by the matter
// notice settings and the budget declaration reminder settings.

export const SLACK_TEMPLATE_MAX_LENGTH = 1000;

export type SlackPlaceholder = {
  key: string;
  description: string;
  sample: string;
};

// Identifier-like {name} (letters, digits, _) is a placeholder candidate, so typos such as {Assignee}
// are rejected; braces holding anything else (e.g. {至急}, JSON) stay ordinary text.
const PLACEHOLDER_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

// Replaces only known placeholders; unknown ones are kept verbatim so a stale template never throws at send time.
export const expandSlackTemplate = (
  template: string,
  values: Readonly<Record<string, string>>,
): string =>
  template.replace(PLACEHOLDER_PATTERN, (whole, key: string) =>
    Object.hasOwn(values, key) ? values[key] : whole,
  );

export const usesSlackPlaceholder = (template: string, key: string): boolean =>
  Array.from(template.matchAll(PLACEHOLDER_PATTERN)).some(
    (match) => match[1] === key,
  );

export const sampleValues = (
  placeholders: readonly SlackPlaceholder[],
): Record<string, string> =>
  Object.fromEntries(placeholders.map(({ key, sample }) => [key, sample]));

export type SlackTemplateRules = {
  label: string;
  allowed: readonly string[];
  required?: readonly string[];
};

// Returns a Japanese error message, or null when valid. Server Actions must call this again (defense in depth).
export const validateSlackTemplate = (
  template: string,
  { label, allowed, required = [] }: SlackTemplateRules,
): string | null => {
  if (template.trim().length === 0) {
    return `${label}を入力してください。`;
  }
  if (template.length > SLACK_TEMPLATE_MAX_LENGTH) {
    return `${label}は${SLACK_TEMPLATE_MAX_LENGTH}文字以内で入力してください。`;
  }

  const used = new Set(
    Array.from(template.matchAll(PLACEHOLDER_PATTERN), (match) => match[1]),
  );
  const unknown = Array.from(used).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    return `${label}に使用できないプレースホルダがあります: ${unknown
      .map((key) => `{${key}}`)
      .join("、")}`;
  }
  const missing = required.filter((key) => !used.has(key));
  if (missing.length > 0) {
    return `${label}には${missing.map((key) => `{${key}}`).join("、")}を含めてください。`;
  }
  return null;
};
