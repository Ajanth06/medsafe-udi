import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

const AUTH_BOOTSTRAP_TIMEOUT_MS = 3500;

export async function loadUserWithTimeout(): Promise<User | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("auth_timeout")), AUTH_BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);

    if (result.error) {
      if (result.error.message !== "Auth session missing!") {
        console.error("Supabase getUser error:", result.error);
      }
      return null;
    }

    return result.data.user ?? null;
  } catch (error) {
    console.error("Auth bootstrap failed:", error);
    return null;
  }
}
