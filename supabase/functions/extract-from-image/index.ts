import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { image_url } = await req.json();

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: "image_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageResponse = await fetch(image_url);
    if (!imageResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Could not fetch image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    const contentType = imageResponse.headers.get("content-type") || "image/png";

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: contentType,
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: `Analyze this image. It may contain one or multiple industrial/MRO products, parts, or RFQ line items (e.g. a table, a list, a screenshot of a quote or purchase order).

Extract ALL products/parts visible (up to 12). For each one extract:
- Brand/Manufacturer (marca)
- Model number or part number (modelo)
- Quantity if visible (qty, default to 1)

Respond ONLY with a JSON object in this exact format:
{"products": [{"marca": "Siemens", "modelo": "6ES7 214-1AG40-0XB0", "qty": 2}, {"marca": "ABB", "modelo": "ACS580-01-012A-4", "qty": 1}]}

Rules:
- Always return the "products" array, even if there is only 1 product.
- If a row has a part number but no brand, set marca to "".
- If you cannot identify any products, respond with: {"products": []}
- Do not include any other text, only the JSON.`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", errText);
      return new Response(
        JSON.stringify({ products: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeResponse.json();
    const textContent = claudeData.content?.[0]?.text || "";

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (Array.isArray(parsed.products)) {
        const products = parsed.products.slice(0, 12).map((p: { marca?: string; modelo?: string; qty?: number }) => ({
          marca: p.marca || "",
          modelo: p.modelo || "",
          qty: p.qty || 1,
        }));
        return new Response(
          JSON.stringify({ products }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (parsed.marca || parsed.modelo) {
        return new Response(
          JSON.stringify({ products: [{ marca: parsed.marca || "", modelo: parsed.modelo || "", qty: parsed.qty || 1 }] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ products: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("extract-from-image error:", err);
    return new Response(
      JSON.stringify({ products: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
