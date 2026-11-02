// Resolve the swatches in the visual spec to concrete colors for CSS, SVG and canvas.
export function visualizationColors(spec) {
  const section = spec.match(/<section id="color"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  if (!section) throw new Error("Missing visual spec #color");
  const swatches = Object.fromEntries(Array.from(section.matchAll(/class="swatch" style="background:([^"]+)"[\s\S]*?class="token-name">(--lh-[\w-]+)</g), ([, value, name]) => [name, value.toLowerCase()]));
  const swatch = (name) => {
    const value = swatches["--lh-" + name];
    if (!/^#[a-f0-9]{6}$/.test(value)) throw new Error("Missing hexadecimal swatch: " + name);
    return value;
  };
  const page = swatch("page"), ink = swatch("ink"), amber = swatch("classic-amber"), brass = swatch("brass");
  // Linear interpolation in sRGB, matching color-mix(in srgb). Fraction is the amount of the second color.
  function mix(from, to, fraction) {
    const channels = [1, 3, 5].map((i) => {
      const a = parseInt(from.slice(i, i + 2), 16);
      const b = parseInt(to.slice(i, i + 2), 16);
      return Math.round(a + (b - a) * fraction).toString(16).padStart(2, "0");
    });
    return "#" + channels.join("");
  }
  const onPrimary = spec.match(/--lh-on-primary:\s*(#[a-f0-9]{6})\s*;/i)?.[1];
  if (!onPrimary) throw new Error("Missing visual spec --lh-on-primary");
  const whiteSurface = swatches["--lh-surface"]?.match(/^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/);
  if (!whiteSurface) throw new Error("Check #color surface swatch before changing chart surfaces");
  return {
    "--bg": page, "--surface": mix(page, "#ffffff", Number(whiteSurface[1])), "--surface-raised": swatch("page-start"),
    "--surface-muted": swatch("page-end"), "--surface-inverse": ink, "--surface-inverse-muted": mix(ink, page, 0.10),
    "--text": ink, "--text-muted": mix(ink, page, 0.25), "--text-soft": mix(ink, page, 0.32), "--text-inverse": swatch("page-start"),
    "--border": mix(page, ink, 0.15), "--border-strong": mix(page, ink, 0.37),
    "--primary": amber, "--on-primary": onPrimary, "--primary-text": swatch("primary-text"), "--primary-soft": mix(page, amber, 0.14),
    "--viz-grid": mix(page, ink, 0.15), "--viz-reference": mix(ink, page, 0.32),
    "--viz-series-secondary": brass, "--viz-series-secondary-text": swatch("brass-text"),
    "--danger": swatch("danger"), "--danger-text": swatch("danger-text"),
    "--viz-accent-strong": swatch("primary-text"), "--viz-accent": amber,
    "--viz-accent-mid": mix(amber, page, 0.28), "--viz-accent-soft": mix(amber, page, 0.54),
    "--viz-accent-subtle": mix(amber, page, 0.75), "--viz-accent-area": mix(amber, page, 0.88),
    "--viz-accent-on-dark-strong": mix(amber, page, 0.78), "--viz-accent-on-dark": mix(amber, page, 0.53),
    "--viz-accent-on-dark-mid": mix(amber, page, 0.22), "--viz-accent-on-dark-soft": amber,
    "--viz-accent-on-dark-subtle": swatch("primary-text"), "--viz-accent-on-dark-area": mix(ink, amber, 0.20),
  };
}

export function colorDeclarations(colors) {
  return Object.entries(colors).map(([role, value]) => "  " + role + ": " + value + ";").join("\n");
}

// The bundled ECharts merges its nine default series colors by index, including hover fallbacks.
export function engineSeriesColors(colors) {
  return ["--viz-accent", "--viz-series-secondary", "--text", "--viz-accent-strong",
    "--viz-accent-mid", "--viz-series-secondary-text", "--viz-accent-soft", "--text-muted",
    "--viz-accent-subtle"].map((name) => colors[name]);
}
