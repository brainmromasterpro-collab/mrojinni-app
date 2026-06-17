import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import mammoth from "npm:mammoth@1.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractTextFromXlsx(buffer: ArrayBuffer): Promise<string> {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    lines.push(csv);
    if (lines.join("\n").length > 8000) break;
  }
  return lines.join("\n").slice(0, 8000);
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result.value || "").slice(0, 8000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { file_url, file_type } = await req.json();

    if (!file_url) {
      return jsonResponse({ error: "file_url is required" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return jsonResponse({ error: "Could not fetch file" }, 400);
    }

    const buffer = await fileResponse.arrayBuffer();
    let text = "";

    const ext = (file_type || file_url).toLowerCase();
    if (ext.includes("xlsx") || ext.includes("xls") || ext.includes("spreadsheet")) {
      text = await extractTextFromXlsx(buffer);
    } else if (ext.includes("docx") || ext.includes("doc") || ext.includes("word")) {
      text = await extractTextFromDocx(buffer);
    } else {
      return jsonResponse({ error: "Unsupported file type", products: [] }, 400);
    }

    if (!text.trim()) {
      return jsonResponse({ products: [], message: "No text extracted from document" });
    }

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Analyze this document content from an industrial/MRO purchase context. Extract ALL products/parts mentioned with their brand, model/part number, and quantity.

Document content:
---
${text}
---

Respond ONLY with a JSON array like:
[{"marca": "Siemens", "modelo": "6ES7 214-1AG40-0XB0", "qty": 2}, {"marca": "Allen Bradley", "modelo": "1756-L71", "qty": 1}]

Rules:
- Extract every distinct product/part you can identify
- "marca" = brand/manufacturer
- "modelo" = model number, part number, or catalog number
- "qty" = quantity (default 1 if not specified)
- If a row has no clear brand, use the most likely manufacturer based on the part number
- Skip rows that are clearly headers, totals, or non-product text
- Return an empty array [] if no products can be identified
- Do not include any other text, only the JSON array.`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", errText);
      return jsonResponse({ products: [], error: "AI analysis failed" });
    }

    const claudeData = await claudeResponse.json();
    const textContent = claudeData.content?.[0]?.text || "";

    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const products = Array.isArray(parsed)
        ? parsed.map((p: { marca?: string; modelo?: string; qty?: number }) => ({
            marca: p.marca || "",
            modelo: p.modelo || "",
            qty: p.qty || 1,
          }))
        : [];
      return jsonResponse({ products });
    }

    return jsonResponse({ products: [] });
  } catch (err) {
    console.error("extract-from-document error:", err);
    return jsonResponse({ error: "Internal error", products: [] }, 500);
  }
});
