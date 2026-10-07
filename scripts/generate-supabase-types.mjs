import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

const root = process.cwd();

async function readProjectUrl() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  for (const fileName of [".env.local", ".env"]) {
    try {
      const contents = await readFile(path.join(root, fileName), "utf8");
      const value = parse(contents).NEXT_PUBLIC_SUPABASE_URL;
      if (value) return value;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is missing from the environment and .env files.",
  );
}

const projectUrl = new URL(await readProjectUrl());
const projectRef = projectUrl.hostname.split(".")[0];

if (!/^[a-z0-9-]+$/i.test(projectRef)) {
  throw new Error("Could not determine the Supabase project ref from its URL.");
}

const args = [
  "supabase",
  "gen",
  "types",
  "typescript",
  "--project-id",
  projectRef,
  "--schema",
  "public",
];
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(executable, args, {
  cwd: root,
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "inherit"],
});

const output = [];
child.stdout.on("data", (chunk) => output.push(chunk));

child.on("error", (error) => {
  console.error("Could not start Supabase type generation:", error);
  process.exitCode = 1;
});

child.on("close", async (code) => {
  const generatedTypes = Buffer.concat(output).toString("utf8");
  if (code !== 0) {
    if (generatedTypes.trim()) {
      console.error(generatedTypes.trimEnd());
    }
    console.error(
      `Supabase type generation failed with exit code ${code ?? "unknown"}.`,
    );
    process.exitCode = code ?? 1;
    return;
  }

  if (!generatedTypes.trim()) {
    console.error("Supabase CLI returned empty database types.");
    process.exitCode = 1;
    return;
  }

  const outputPath = path.join(root, "types", "database.types.ts");
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, generatedTypes);
    console.log("Updated types/database.types.ts from the Supabase project.");
  } catch (error) {
    console.error("Could not save generated Supabase types:", error);
    process.exitCode = 1;
  }
});
