const { openrouterApiKey, openrouterModel } = require("../config");

const rewriteSystemPrompt =
  `You are a professional AI writing assistant designed to humanize and refine text across different contexts.

Your task is to rewrite the user's input so it sounds natural, fluent, and human-written while strictly preserving the original meaning.

Core Objectives:
- Improve clarity, flow, and readability
- Make the text sound natural and human-like
- Remove robotic, stiff, or repetitive phrasing
- Maintain authenticity and intent

Rewriting Rules:
- Preserve meaning exactly; do not add or remove key information
- Fix grammar, punctuation, and awkward phrasing
- Use varied sentence structures (mix short and long sentences)
- Eliminate redundancy and unnecessary words
- Avoid overly complex or unnatural vocabulary
- Ensure smooth transitions between sentences
- Keep tone consistent with the requested style

Tone Handling:
- Adapt tone based on the provided parameter:
  - "professional" → clear, concise, formal
  - "casual" → friendly, conversational
  - "confident" → assertive, strong wording
  - "persuasive" → engaging and compelling
  - "simple" → easy to understand, minimal complexity

Length Handling:
- "short" → concise and to the point
- "medium" → balanced clarity and detail
- "long" → more expressive and polished

Technical Constraints:
- Do not alter names, numbers, or factual details
- Preserve technical terminology when required
- Do not introduce new ideas or assumptions

Output Rules:
- Return only the rewritten text
- Do not include explanations or extra formatting`;

const maxChunkLength = 3500;
const maxConcurrentRequests = 4;

function chunkText(inputText) {
  const normalized = inputText.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChunkLength) {
    return [normalized];
  }

  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChunkLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChunkLength) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChunkLength) {
      chunks.push(paragraph.slice(index, index + maxChunkLength));
    }
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(Boolean);
}

async function rewriteChunk(chunkTextValue, chunkIndex, totalChunks) {
  if (!openrouterApiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in backend/.env");
  }

  console.log(
    `[openrouter] Starting chunk ${chunkIndex}/${totalChunks} with model "${openrouterModel}" for ${chunkTextValue.length} characters`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        temperature: 0.7,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content: rewriteSystemPrompt,
          },
          {
            role: "user",
            content: chunkTextValue,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[openrouter] Request timed out");
      throw new Error(
        "OpenRouter request timed out. Check your internet connection, API key, and selected model.",
      );
    }

    console.error("[openrouter] Network error:", error.message);
    throw new Error(
      "Could not connect to OpenRouter. Check your internet connection or firewall and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json();
  console.log(
    `[openrouter] Chunk ${chunkIndex}/${totalChunks} response status: ${response.status}`,
  );
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      "OpenRouter request failed";
    console.error("[openrouter] API error:", message);
    throw new Error(message);
  }

  const result = payload?.choices?.[0]?.message?.content?.trim() || "";
  console.log(
    `[openrouter] Chunk ${chunkIndex}/${totalChunks} rewrite complete: ${result.length} characters returned`,
  );
  return result;
}

async function humanizeText(inputText, options = {}) {
  const { onProgress } = options;
  const chunks = chunkText(inputText);
  console.log(`[openrouter] Split input into ${chunks.length} chunk(s)`);

  const rewrittenChunks = new Array(chunks.length);
  const inProgressCount = { count: 0 };

  const processChunk = async (index) => {
    try {
      inProgressCount.count++;
      if (onProgress) {
        onProgress({
          stage: "rewriting",
          currentChunk: index + 1,
          totalChunks: chunks.length,
          message: `Rewriting chunk ${index + 1} of ${chunks.length}`,
        });
      }
      const rewrittenChunk = await rewriteChunk(
        chunks[index],
        index + 1,
        chunks.length,
      );
      rewrittenChunks[index] = rewrittenChunk;
      inProgressCount.count--;
    } catch (error) {
      inProgressCount.count--;
      throw error;
    }
  };

  const processingQueue = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const promise = (async () => {
      await new Promise((resolve) => {
        const checkQueue = setInterval(() => {
          if (inProgressCount.count < maxConcurrentRequests) {
            clearInterval(checkQueue);
            resolve();
          }
        }, 50);
      });
      await processChunk(index);
    })();
    processingQueue.push(promise);
  }

  await Promise.all(processingQueue);

  return rewrittenChunks.join("\n\n");
}

module.exports = {
  humanizeText,
};
