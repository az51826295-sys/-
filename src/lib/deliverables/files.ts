import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/**
 * Files a deliverable is made of.
 *
 * Everything until now has been markdown, because every employee was the same
 * model producing text. A music team's work is an audio file and an artist's is
 * an image, and this is the seam that lets a deliverable be made of something
 * other than words.
 *
 * The bucket is private on purpose. What a company's employees produce belongs
 * to that company — a soundtrack on a guessable public URL is not a storage
 * detail, it is giving the work away. Reads go through signed URLs that expire.
 */

export const BUCKET = "deliverable-files";

/** How long a link the manager is handed stays good for. Long enough to open
 *  and listen to something, short enough that a copied URL in a chat log stops
 *  working. */
const SIGNED_URL_SECONDS = 60 * 60;

export type FileKind = "audio" | "image" | "archive" | "document";

export interface DeliverableFile {
  id: string;
  title: string;
  description: string | null;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  producedByBackend: string | null;
}

/**
 * The path an object lives at.
 *
 * The company id goes first because that is what makes isolation enforceable
 * in the storage layer. A storage policy cannot join to another table — it can
 * only read the object's own name — so the id has to be *in* the path for the
 * policy to have anything to check.
 */
export function pathFor(
  companyId: string,
  deliverableId: string,
  filename: string,
): string {
  // Anything that could climb out of the folder is stripped rather than
  // escaped. A filename is a label here, not a location.
  const safe = filename.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120);
  return `${companyId}/${deliverableId}/${safe}`;
}

/**
 * Stores one file and records what it is.
 *
 * The row is written after the upload succeeds, so a failed upload leaves
 * nothing behind rather than a row pointing at an object that was never
 * created — the viewer would find that gap later, in front of the manager.
 */
export async function storeDeliverableFile(
  db: Db,
  input: {
    companyId: string;
    deliverableId: string;
    filename: string;
    body: Uint8Array | Blob;
    kind: FileKind;
    mimeType: string;
    title: string;
    description?: string;
    producedByBackend?: string;
  },
): Promise<{ ok: true; file: DeliverableFile } | { ok: false; error: string }> {
  const storagePath = pathFor(
    input.companyId,
    input.deliverableId,
    input.filename,
  );

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, input.body, {
      contentType: input.mimeType,
      // A retry of the same piece of work replaces its file rather than
      // accumulating "theme(1).mp3" beside it.
      upsert: true,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const sizeBytes =
    input.body instanceof Blob ? input.body.size : input.body.byteLength;

  const { data, error } = await db
    .from("deliverable_files")
    .upsert(
      {
        company_id: input.companyId,
        deliverable_id: input.deliverableId,
        storage_path: storagePath,
        kind: input.kind,
        mime_type: input.mimeType,
        size_bytes: sizeBytes,
        title: input.title,
        description: input.description ?? null,
        produced_by_backend: input.producedByBackend ?? null,
      },
      { onConflict: "storage_path" },
    )
    .select("*")
    .single();

  if (error || !data) {
    // The object is up but unrecorded. Removed rather than left orphaned:
    // nothing lists the bucket, so an unrecorded object is invisible storage
    // nobody will ever delete.
    await db.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "The file was stored but could not be recorded." };
  }

  return { ok: true, file: rowToFile(data) };
}

/** Everything a deliverable is made of, oldest first. */
export async function loadDeliverableFiles(
  db: Db,
  deliverableId: string,
): Promise<DeliverableFile[]> {
  const { data } = await db
    .from("deliverable_files")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map(rowToFile);
}

/**
 * A link the manager's browser can open.
 *
 * Signed rather than public, and re-signed on every page load rather than
 * stored. A URL saved in the database would outlive the permission that
 * created it.
 */
export async function signedUrlFor(
  db: Db,
  storagePath: string,
): Promise<string | null> {
  const { data } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

  return data?.signedUrl ?? null;
}

/** Signs a whole set in one pass, so a deliverable with eight tracks is one
 *  round trip rather than eight. */
export async function signedUrlsFor(
  db: Db,
  files: DeliverableFile[],
): Promise<Map<string, string>> {
  if (files.length === 0) return new Map();

  const { data } = await db.storage
    .from(BUCKET)
    .createSignedUrls(
      files.map((file) => file.storagePath),
      SIGNED_URL_SECONDS,
    );

  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }

  // Keyed by file id for the caller, who has files rather than paths.
  const byId = new Map<string, string>();
  for (const file of files) {
    const url = byPath.get(file.storagePath);
    if (url) byId.set(file.id, url);
  }
  return byId;
}

function rowToFile(row: Record<string, unknown>): DeliverableFile {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    kind: row.kind as FileKind,
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes ?? 0),
    storagePath: row.storage_path as string,
    producedByBackend: (row.produced_by_backend as string | null) ?? null,
  };
}

/** Bytes as a person reads them. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
