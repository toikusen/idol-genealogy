import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchIgPhotoUrl(username: string): Promise<string | null> {
  // Try Instagram's internal JSON API first
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "ja-JP,ja;q=0.9",
          "Referer": "https://www.instagram.com/",
          "Origin": "https://www.instagram.com",
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    );
    if (res.ok) {
      const json = await res.json();
      const user = json?.data?.user;
      const url: string | undefined = user?.profile_pic_url_hd || user?.profile_pic_url;
      if (url) return url;
    }
  } catch (_) {}

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
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    contentType = imgRes.headers.get("content-type") || "image/jpeg";
    imageBytes = await imgRes.arrayBuffer();
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

  const ext = contentType.includes("webp") ? "webp" : "jpg";
  const filePath = `ig/${username}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("member-photos")
    .upload(filePath, imageBytes, {
      contentType,
      upsert: true,
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
