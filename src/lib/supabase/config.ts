function isValidHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasSupabaseEnv() {
  return Boolean(
    isValidHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !isValidHttpUrl(url) || !key) {
    throw new Error(
      "Supabase non configurato. Copia .env.example in .env.local e inserisci la publishable key.",
    );
  }

  return { url, key };
}

export function getSupabaseServerSecretEnv() {
  const { url } = getSupabaseEnv();
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "Supabase server secret non configurata. Imposta SUPABASE_SECRET_KEY nel runtime server.",
    );
  }

  return { url, key };
}
