"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * Client-side guard: if Supabase isn't configured (missing env), redirect to landing page.
 * Returns whether Supabase is configured so callers can render nothing while redirecting.
 */
export function useRequireSupabaseConfigured(redirectTo: string = "/"): boolean {
  const router = useRouter();

  useEffect(() => {
    if (!supabaseConfigured) {
      router.replace(redirectTo);
    }
  }, [router, redirectTo]);

  return supabaseConfigured;
}
