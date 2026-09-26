import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Must match the member-photos bucket's allowed_mime_types (migration 112).
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const JSON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ja-JP,ja;q=0.9",
  "Referer": "https://www.instagram.com/",
  "Origin": "https://www.instagram.com",
  "x-ig-app-id": "936619743392459",
  "x-requested-with": "XMLHttpRequest",
};

/** The real image type from its first bytes; CDN headers are not always right. */
function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    return `image/${brand.trim()}`; // heic / mif1 …: not allowed in the bucket
  }
  return null;
}

async function fetchIgPhotoUrl(username: string): Promise<string | null> {
  // Instagram's internal JSON API, on both hosts (one is often blocked when the other isn't).
  for (const host of ["i.instagram.com", "www.instagram.com"]) {
    try {
      const res = await fetch(
        `https://${host}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        { headers: JSON_HEADERS },
      );
      if (res.ok) {
        const json = await res.json();
        const user = json?.data?.user;
        const url: string | undefined = user?.profile_pic_url_hd || user?.profile_pic_url;
        if (url) return url;
      }
    } catch (_) {}
  }

  // Fallback: parse og:image (filter out generic IG icons)
  try {
    const res = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8",
      },
    });
    const html = await res.text();
    for (const pattern of [
      /<meta\s+property="og:image"\s+content="([^"]+)"/,
      /<meta\s+content="([^"]+)"\s+property="og:image"/,
    ]) {
      const match = html.match(pattern);
      if (match?.[1] && !match[1].includes("rsrc.php")) return match[1];
    }
  } catch (_) {}

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const username = url.searchParams.get("username");

  if (!username) {
    return new Response(JSON.stringify({ error: "username required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Get IG CDN URL
  const igUrl = await fetchIgPhotoUrl(username);
  if (!igUrl) {
    return new Response(
      JSON.stringify({ error: "blocked", hint: "Instagram blocked the request" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Download image from Instagram CDN
  let imageBytes: ArrayBuffer;
  let contentType = "image/jpeg";
  try {
    const imgRes = await fetch(igUrl, {
      headers: {
        "Referer": "https://www.instagram.com/",
        // Ask for formats the bucket accepts, never HEIC.
        "Accept": "image/jpeg,image/webp,image/png;q=0.9,*/*;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    imageBytes = await imgRes.arrayBuffer();
    // The bucket only takes a bare, allowed image type: headers like
    // "image/jpeg; charset=…" or "application/octet-stream" are rejected, so
    // trust the file's own bytes over the CDN's header.
    const header = (imgRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    contentType = sniffImageType(new Uint8Array(imageBytes.slice(0, 16))) ?? header;
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error(`unsupported image type ${contentType || "(unknown)"}`);
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Image download failed: ${e.message}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Upload to Supabase Storage
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  // A new name per fetch: re-fetching used to overwrite ig/<user>.jpg, and
  // browsers / the CDN kept showing the old photo under the unchanged URL.
  const safeName = username.replace(/[^A-Za-z0-9._-]/g, "_");
  const filePath = `ig/${safeName}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("member-photos")
    .upload(filePath, imageBytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    return new Response(JSON.stringify({ error: `Upload failed: ${uploadError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Return permanent public URL
  const { data: publicUrlData } = supabase.storage
    .from("member-photos")
    .getPublicUrl(filePath);

  return new Response(JSON.stringify({ photo_url: publicUrlData.publicUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
