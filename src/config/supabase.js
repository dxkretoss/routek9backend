import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import env from "./env.js";

// Polyfill native WebSocket for Node.js < 22 environments
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.warn("⚠️ Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing in .env");
}

// Single client initialized with Lovable Cloud Supabase URL & Anon Key
export const supabase = createClient(
  env.supabaseUrl || "",
  env.supabaseAnonKey || "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WebSocket,
    },
  }
);

export default supabase;

