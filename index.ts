// Supabase Edge Function: handles upload / list / delete for skins.
// Runs server-side with the SERVICE ROLE key (set as a secret, never
// exposed to the browser), so this is the only place allowed to write
// to the database or the storage bucket.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UPLOAD_SECRET = Deno.env.get("UPLOAD_SECRET") ?? "2308";

const BUCKET = "skins";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // Supabase free-tier hard limit per file

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeName(name: string): string {
  const base = name.split("/").pop() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9_.\-]/g, "_");
  return cleaned === "" ? "file" : cleaned;
}

async function handleUpload(req: Request): Promise<Response> {
  const form = await req.formData();

  const secret = String(form.get("secret") ?? "");
  if (secret !== UPLOAD_SECRET) {
    return json({ status: "error", message: "Incorrect secret code." }, 403);
  }

  const code = String(form.get("code") ?? "").trim();
  if (!/^\d{4}$/.test(code)) {
    return json({ status: "error", message: "Code must be exactly 4 digits." });
  }

  const name = String(form.get("name") ?? "").trim();
  const confirm = form.get("confirm") === "1";

  const preview = form.get("preview");
  const downloads = form.getAll("downloads");

  if (!(preview instanceof File)) {
    return json({ status: "error", message: "Please choose a preview image." });
  }
  if (downloads.length === 0 || !(downloads[0] instanceof File)) {
    return json({ status: "error", message: "Please choose at least one download file." });
  }

  const allFiles = [preview, ...downloads] as File[];
  for (const f of allFiles) {
    if (f.size > MAX_FILE_BYTES) {
      return json({ status: "error", message: `"${f.name}" is over the 50MB per-file limit.` });
    }
  }

  const { data: existing } = await supabase
    .from("skins")
    .select("name")
    .eq("code", code)
    .maybeSingle();

  if (existing && !confirm) {
    return json({ status: "exists", name: existing.name });
  }

  if (existing) {
    const { data: oldFiles } = await supabase
      .from("skin_files")
      .select("file_path")
      .eq("code", code);
    const { data: oldSkin } = await supabase
      .from("skins")
      .select("preview_path")
      .eq("code", code)
      .maybeSingle();

    const paths = [
      ...((oldFiles ?? []).map((f: { file_path: string }) => f.file_path)),
      ...(oldSkin ? [oldSkin.preview_path] : []),
    ];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

    await supabase.from("skin_files").delete().eq("code", code);
    await supabase.from("skins").delete().eq("code", code);
  }

  const previewPath = `${code}/preview_${safeName(preview.name)}`;
  const { error: previewErr } = await supabase.storage
    .from(BUCKET)
    .upload(previewPath, preview, { upsert: true, contentType: preview.type || undefined });

  if (previewErr) {
    return json({ status: "error", message: "Failed to save preview image: " + previewErr.message }, 500);
  }

  const { error: insertSkinErr } = await supabase
    .from("skins")
    .insert({ code, name, preview_path: previewPath });

  if (insertSkinErr) {
    return json({ status: "error", message: "Failed to save skin record: " + insertSkinErr.message }, 500);
  }

  const fileRows: { code: string; filename: string; file_path: string }[] = [];
  let i = 0;
  for (const f of downloads as File[]) {
    const path = `${code}/${i}_${safeName(f.name)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f, { upsert: true, contentType: f.type || undefined });
    if (!error) {
      fileRows.push({ code, filename: f.name, file_path: path });
    }
    i++;
  }

  if (fileRows.length) {
    await supabase.from("skin_files").insert(fileRows);
  }

  return json({ status: "ok" });
}

async function handleList(req: Request): Promise<Response> {
  const form = await req.formData();
  const secret = String(form.get("secret") ?? "");
  if (secret !== UPLOAD_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: skins } = await supabase.from("skins").select("code, name");
  const { data: files } = await supabase.from("skin_files").select("code");

  const counts: Record<string, number> = {};
  (files ?? []).forEach((f: { code: string }) => {
    counts[f.code] = (counts[f.code] ?? 0) + 1;
  });

  const result = (skins ?? [])
    .map((s: { code: string; name: string }) => ({ code: s.code, name: s.name, file_count: counts[s.code] ?? 0 }))
    .sort((a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code));

  return json(result);
}

async function handleDelete(req: Request): Promise<Response> {
  const form = await req.formData();
  const secret = String(form.get("secret") ?? "");
  if (secret !== UPLOAD_SECRET) {
    return json({ status: "error", message: "Forbidden." }, 403);
  }

  const code = String(form.get("code") ?? "").trim();
  if (!/^\d{4}$/.test(code)) {
    return json({ status: "error", message: "Invalid code." });
  }

  const { data: files } = await supabase
    .from("skin_files")
    .select("file_path")
    .eq("code", code);
  const { data: skin } = await supabase
    .from("skins")
    .select("preview_path")
    .eq("code", code)
    .maybeSingle();

  const paths = [
    ...((files ?? []).map((f: { file_path: string }) => f.file_path)),
    ...(skin ? [skin.preview_path] : []),
  ];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  await supabase.from("skin_files").delete().eq("code", code);
  await supabase.from("skins").delete().eq("code", code);

  return json({ status: "ok" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Supabase mounts this function at /functions/v1/api, so the action
  // is whatever comes after that: /functions/v1/api/upload -> "upload"
  const segments = url.pathname.split("/").filter(Boolean);
  const action = segments[segments.length - 1];

  try {
    if (action === "upload" && req.method === "POST") return await handleUpload(req);
    if (action === "list" && req.method === "POST") return await handleList(req);
    if (action === "delete" && req.method === "POST") return await handleDelete(req);
    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ status: "error", message: "Server error: " + String(err) }, 500);
  }
});
