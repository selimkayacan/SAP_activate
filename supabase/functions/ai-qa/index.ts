// supabase/functions/ai-qa/index.ts
// Deploy: supabase functions deploy ai-qa
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse request
    const { l2Name, phase, workstream, l3tasks, templateContext, customerFileText } = await req.json();

    const prompt = `You are an SAP S/4HANA implementation QA expert.

L2 Task: "${l2Name}"
Phase: ${phase} | Workstream: ${workstream}

L3 Sub-tasks:
• ${l3tasks.join('\n• ')}

=== REFERENCE TEMPLATES (per sub-task) ===
${templateContext}

=== CUSTOMER SUBMITTED DELIVERABLE ===
${customerFileText}

Compare the customer deliverable against the reference templates. Be thorough and specific.
Respond ONLY with this JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence overall assessment",
  "overall_score": 72,
  "critical_gaps": ["specific critical gap"],
  "overdue_risks": ["at-risk or overdue item"],
  "missing_items": ["item missing from deliverable"],
  "differences": ["content difference vs template"],
  "positives": ["what was done well"],
  "recommendations": ["actionable recommendation"]
}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const result = await anthropicResponse.json();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
