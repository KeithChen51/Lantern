/** Optional portal profile data; never an account identifier or authorization input. */
export function readPortalEmployeeName(value: unknown, account: string): string | undefined {
  if (typeof value !== "string" || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  const name = value.trim();
  return name && name !== account ? name : undefined;
}

/** Older sessions may still contain the employee number as their display name. */
export function employeeDisplayName(displayName: string, account: string): string {
  return !displayName.trim() || displayName.trim() === account ? "姓名暂未获取" : displayName;
}
