const { openrouterApiKey, openrouterModel } = require("../config");

const grammarSystemPrompt = `You are a strict grammar and spelling checker. Find errors in the user's text and return JSON.

Rules:
- Detect: spelling mistakes, grammar errors (subject-verb agreement, tense, missing articles, wrong word forms), and capitalization errors (start of sentence, the pronoun "I", proper nouns).
- Do NOT make stylistic suggestions. Do NOT replace casual phrasing. Do NOT change passive to active. Do NOT polish tone.
- Do NOT flag deliberate informal usage. Contractions are fine. Sentence fragments are fine. Casual openers are fine.
- Only flag ACTUAL errors a careful editor would correct.

Output JSON in this exact shape:
{"issues": [{"original": "<exact wrong substring>", "suggestion": "<corrected version>", "type": "spelling" | "grammar" | "capitalization"}]}

For each issue:
- "original" MUST be an exact verbatim substring of the input text. Keep it as short as possible — just the wrong word or short phrase, not the whole sentence.
- "suggestion" is what the user should replace the original with.
- "type" is one of "spelling", "grammar", or "capitalization".

If the text has no errors, return {"issues": []}.

Return only the JSON. No commentary, no markdown.`;

async function checkGrammar(text) {
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const trimmed = text.trim();
  if (trimmed.length < 10 || trimmed.length > 5000) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterApiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Huminzer",
        },
        body: JSON.stringify({
          model: openrouterModel,
          stream: false,
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: grammarSystemPrompt },
            { role: "user", content: trimmed },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errPayload = await response.json().catch(() => null);
      console.error(
        "[grammar] API error:",
        errPayload?.error?.message || response.status,
      );
      return [];
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[grammar] No JSON in response");
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("[grammar] JSON parse failed:", err.message);
      return [];
    }

    const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : [];

    const cleaned = [];
    for (const issue of rawIssues) {
      if (!issue || typeof issue !== "object") continue;
      const original = typeof issue.original === "string" ? issue.original : "";
      const suggestion =
        typeof issue.suggestion === "string" ? issue.suggestion : "";
      const type =
        issue.type === "spelling" ||
        issue.type === "grammar" ||
        issue.type === "capitalization"
          ? issue.type
          : "grammar";
      if (!original || !suggestion || original === suggestion) continue;
      if (!trimmed.includes(original)) continue;
      cleaned.push({ original, suggestion, type });
    }

    return cleaned;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[grammar] Timed out");
    } else {
      console.error("[grammar] Failed:", error.message);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { checkGrammar };
