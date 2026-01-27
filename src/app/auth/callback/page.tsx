import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 720, margin: "60px auto", fontFamily: "system-ui" }}><h1>Confirmando…</h1></main>}>
      <CallbackClient />
    </Suspense>
  );
}
