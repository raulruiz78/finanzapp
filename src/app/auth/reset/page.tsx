"use client";

import { Suspense } from "react";
import ResetClient from "./ResetClient";

export default function AuthResetPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 720, margin: "60px auto", fontFamily: "system-ui" }}><h1>Recuperar contraseña</h1></main>}>
      <ResetClient />
    </Suspense>
  );
}

