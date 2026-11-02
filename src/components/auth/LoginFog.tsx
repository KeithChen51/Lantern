import styles from "./login-fog.module.css";

export function LoginFog() {
  return (
    <>
      <link rel="preload" as="image" href="/images/sea-fog-bank.webp" media="(prefers-reduced-motion: no-preference)" fetchPriority="high" />
      <div data-lh-login-curtain className={styles.curtain} aria-hidden="true">
        <div className={styles.farBank} />
        <div className={styles.nearBank} />
        <div className={styles.lowMist} />
      </div>
    </>
  );
}
