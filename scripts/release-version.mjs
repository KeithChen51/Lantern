export const parseVersion = (version) => {
  if (typeof version !== "string" || /\s/.test(version)) throw new Error("Version must have three numeric parts and an optional prerelease suffix.");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match) throw new Error("Version must have three numeric parts and an optional prerelease suffix.");
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^0\d+$/.test(part))) throw new Error("Numeric prerelease identifiers cannot have leading zeros.");
  return { core: match.slice(1, 4).map(BigInt), prerelease };
};
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const compare = (a, b) => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (const [i, part] of left.core.entries()) {
    if (part !== right.core[i]) return order(part, right.core[i]);
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return order(Number(!left.prerelease.length), Number(!right.prerelease.length));
  }
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const aPart = left.prerelease[i];
    const bPart = right.prerelease[i];
    if (aPart === undefined || bPart === undefined) return order(left.prerelease.length, right.prerelease.length);
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return order(BigInt(aPart), BigInt(bPart));
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return order(aPart, bPart);
  }
  return 0;
};

export const isReleaseVersion = (version) => {
  try { parseVersion(version); return true; } catch { return false; }
};
