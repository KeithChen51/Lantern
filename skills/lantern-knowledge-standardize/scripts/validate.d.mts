export type ValidationResult = {
  protocolVersion: number;
  ready: boolean;
  issues: Array<{severity: string; code: string; line: number; message: string}>;
  metadata: Record<string, unknown> | null;
  body: string | null;
  request: Record<string, unknown> | null;
  linkAccessibility: string;
  factsVerified: boolean;
};
export function validate(text: string, options?: {id?: string}): Promise<ValidationResult>;
