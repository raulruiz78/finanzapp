"use client";

import Image from "next/image";
import styles from "./AppTopBar.module.css";

export function AppTopBar({
  title,
  subtitle,
  backHref = "/dashboard",
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <a className={styles.back} href={backHref} aria-label="Volver">
          ←
        </a>
        <div className={styles.brand}>
          <div className={styles.logoWrap} aria-hidden>
            <Image src="/icono.png" alt="" width={38} height={38} priority />
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
