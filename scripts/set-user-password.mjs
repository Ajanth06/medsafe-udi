import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const userId = process.argv[2]?.trim();
const password = process.argv[3] || "";

if (!userId || !password) {
  console.error("Verwendung: npm run set-password -- <user-id> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Passwort muss mindestens 8 Zeichen lang sein.");
  process.exit(1);
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_KEY?.trim() ||
  "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
  password,
  email_confirm: true,
});

if (error) {
  console.error(`Fehler beim Setzen des Passworts: ${error.message}`);
  process.exit(1);
}

console.log(`Passwort gesetzt für: ${data.user?.email || userId}`);
