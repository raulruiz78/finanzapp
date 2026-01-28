"use client";

import styles from "./AppTopBar.module.css";

export function AppTopBar({
  title,
  subtitle,
  icon,
  iconLabel,
  backHref = "/dashboard",
  showBack = true,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconLabel?: string;
  backHref?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        {showBack ? (
          <a className={styles.back} href={backHref} aria-label="Volver">
            ←
          </a>
        ) : null}
        <div className={styles.brand}>
          <div className={styles.logoWrap}>
            {iconLabel ? (
              <span className={styles.icon} role="img" aria-label={iconLabel}>
                {icon ?? "📌"}
              </span>
            ) : (
              <span className={styles.icon} aria-hidden>
                {icon ?? "📌"}
              </span>
            )}
          </div>
          <div className={styles.text}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </div>
      </div>

      <div className={styles.right}>{right}</div>
    </header>
  );
}
