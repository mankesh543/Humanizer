require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const config = require("./config");
const { extractTextFromFile } = require("./services/extractText");
const { humanizeText } = require("./services/openrouter");
const { checkGrammar } = require("./services/grammar");
const { saveCorrection } = require("./services/learnedDictionary");
const { writeDocxFile } = require("./services/exportDocx");
const { writePdfFile } = require("./services/exportPdf");

const app = express();
const jobs = new Map();
const extractedTextCache = new Map();

const upload = multer({
  dest: config.uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, config.uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, crypto.randomBytes(16).toString("hex"));
    },
  }),
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([".docx", ".pdf", ".txt"]);
    if (!allowed.has(extension)) {
      cb(new Error("Only DOCX, PDF, and TXT files are supported."));
      return;
    }

    cb(null, true);
  },
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.originalUrl}`);
  next();
});

function extractUserApiKey(req) {
  const raw = req.get("X-User-OpenRouter-Key");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseVoice(raw) {
  if (raw == null) return null;
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const allowedPresets = new Set([
    "casual",
    "editorial",
    "academic",
    "marketing",
    "narrative",
    "technical",
  ]);
  const allowedLengths = new Set(["shorter", "same", "longer"]);
  const out = {};
  if (typeof value.preset === "string" && allowedPresets.has(value.preset)) {
    out.preset = value.preset;
  }
  if (typeof value.strength === "number" && Number.isFinite(value.strength)) {
    out.strength = Math.max(0, Math.min(1, value.strength));
  }
  if (
    typeof value.readingLevel === "number" &&
    Number.isInteger(value.readingLevel)
  ) {
    out.readingLevel = Math.max(5, Math.min(16, value.readingLevel));
  }
  if (typeof value.length === "string" && allowedLengths.has(value.length)) {
    out.length = value.length;
  }
  if (typeof value.customInstructions === "string") {
    out.customInstructions = value.customInstructions.slice(0, 500);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function setJobState(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) {
    return;
  }

  jobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function createJob({ sourceName, sourceType }) {
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    status: "queued",
    stage: "queued",
    message: "Waiting to start",
    sourceName,
    sourceType,
    currentChunk: 0,
    totalChunks: 0,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  return job;
}

async function runHumanizeJob({
  jobId,
  originalText,
  sourceName,
  outputBaseName,
  cleanupPath,
  userApiKey,
  voice,
}) {
  try {
    setJobState(jobId, {
      status: "running",
      stage: "rewriting",
      message: "Preparing rewrite",
    });

    console.log(
      `[rewrite] Job ${jobId} sending text to OpenRouter (key=${userApiKey ? "user" : "server"})`,
    );
    const rewrittenText = await humanizeText(originalText, {
      userApiKey,
      voice,
      onProgress: ({ stage, currentChunk, totalChunks, message }) => {
        setJobState(jobId, {
          status: "running",
          stage,
          currentChunk,
          totalChunks,
          message,
          originalText, // Include original text so UI can show it during processing
        });
      },
    });
    console.log(`[rewrite] Job ${jobId} OpenRouter returned rewritten text`);

    setJobState(jobId, {
      status: "running",
      stage: "exporting",
      message: "Building download version",
    });

    const downloadId = crypto.randomUUID();
    const docxFileName = `${outputBaseName}_humanized.docx`;
    const docxFilePath = path.join(config.generatedDir, `${downloadId}.docx`);
    const pdfFileName = `${outputBaseName}_humanized.pdf`;
    const pdfFilePath = path.join(config.generatedDir, `${downloadId}.pdf`);

    console.log(`[export] Job ${jobId} writing files...`);
    await Promise.all([
      writeDocxFile({
        filePath: docxFilePath,
        text: rewrittenText,
      }),
      writePdfFile({
        filePath: pdfFilePath,
        text: rewrittenText,
      }),
    ]);
    console.log(`[export] Job ${jobId} export complete`);

    setJobState(jobId, {
      status: "completed",
      stage: "completed",
      message: "Ready",
      result: {
        fileName: sourceName,
        originalText,
        rewrittenText,
        outputFileName: docxFileName,
        downloadUrl: `/api/download/${downloadId}.docx?name=${encodeURIComponent(docxFileName)}`,
        pdfDownloadUrl: `/api/download/${downloadId}.pdf?name=${encodeURIComponent(pdfFileName)}`,
      },
    });
  } catch (error) {
    console.error(`[humanize] Job ${jobId} failed:`, error.message);
    setJobState(jobId, {
      status: "failed",
      stage: "failed",
      message: error.message || "Failed to process the request.",
      error: error.message || "Failed to process the request.",
    });
  } finally {
    if (cleanupPath) {
      console.log(`[cleanup] Removing temp upload ${cleanupPath}`);
      fs.unlink(cleanupPath).catch(() => {});
    }
  }
}

async function queueFileJob(file, req, res) {
  const sourcePath = file.path;
  const userApiKey = extractUserApiKey(req);
  const voice = parseVoice(req.body?.voice);
  console.log(
    `[upload] Received "${file.originalname}" (${file.size} bytes) at ${sourcePath}`,
  );

  const job = createJob({
    sourceName: file.originalname,
    sourceType: "file",
  });

  try {
    setJobState(job.jobId, {
      status: "running",
      stage: "extracting",
      message: "Extracting text from file",
    });

    console.log(`[extract] Job ${job.jobId} starting text extraction`);

    let extractedText;
    const fileHash = crypto
      .createHash("sha256")
      .update(file.originalname + file.size)
      .digest("hex");

    if (extractedTextCache.has(fileHash)) {
      console.log(`[cache] Using cached extraction for ${file.originalname}`);
      extractedText = extractedTextCache.get(fileHash);
    } else {
      extractedText = (
        await extractTextFromFile(sourcePath, file.originalname)
      ).trim();
      extractedTextCache.set(fileHash, extractedText);
      if (extractedTextCache.size > 50) {
        const firstKey = extractedTextCache.keys().next().value;
        extractedTextCache.delete(firstKey);
      }
    }

    console.log(
      `[extract] Job ${job.jobId} done. Extracted ${extractedText.length} characters`,
    );

    if (!extractedText) {
      setJobState(job.jobId, {
        status: "failed",
        stage: "failed",
        message: "The uploaded file did not contain readable text.",
        error: "The uploaded file did not contain readable text.",
      });
    } else {
      const outputBaseName = path
        .parse(file.originalname)
        .name.replace(/\s+/g, "_");
      runHumanizeJob({
        jobId: job.jobId,
        originalText: extractedText,
        sourceName: file.originalname,
        outputBaseName,
        cleanupPath: sourcePath,
        userApiKey,
        voice,
      });
    }

    res.status(202).json({
      jobId: job.jobId,
      status: jobs.get(job.jobId)?.status,
      message: jobs.get(job.jobId)?.message,
    });
  } catch (error) {
    console.error(
      `[humanize] Job ${job.jobId} failed during extraction:`,
      error.message,
    );
    setJobState(job.jobId, {
      status: "failed",
      stage: "failed",
      message: error.message || "Failed to extract text from file.",
      error: error.message || "Failed to extract text from file.",
    });
    console.log(`[cleanup] Removing temp upload ${sourcePath}`);
    fs.unlink(sourcePath).catch(() => {});
    res.status(202).json({
      jobId: job.jobId,
      status: "failed",
      message: jobs.get(job.jobId)?.message,
    });
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/humanize", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  await queueFileJob(req.file, req, res);
});

app.post("/api/humanize-text", async (req, res) => {
  const rawText =
    typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!rawText) {
    res.status(400).json({ error: "No text provided." });
    return;
  }

  const userApiKey = extractUserApiKey(req);
  const voice = parseVoice(req.body?.voice);

  const job = createJob({
    sourceName: "Pasted text",
    sourceType: "text",
  });

  console.log(`[text] Job ${job.jobId} received ${rawText.length} characters`);
  runHumanizeJob({
    jobId: job.jobId,
    originalText: rawText,
    sourceName: "Pasted text",
    outputBaseName: "pasted_text",
    userApiKey,
    voice,
  });

  res.status(202).json({
    jobId: job.jobId,
    status: "queued",
    message: "Preparing rewrite",
  });
});

app.post("/api/grammar-check", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim()) {
    res.status(200).json({ issues: [] });
    return;
  }
  if (text.length > 5000) {
    res.status(200).json({ issues: [] });
    return;
  }
  try {
    const issues = await checkGrammar(text);
    res.status(200).json({ issues });
  } catch (error) {
    console.error("[grammar] endpoint failed:", error.message);
    res.status(200).json({ issues: [] });
  }
});

app.post("/api/grammar/learn", (req, res) => {
  const original =
    typeof req.body?.original === "string" ? req.body.original : "";
  const suggestion =
    typeof req.body?.suggestion === "string" ? req.body.suggestion : "";
  if (!original.trim() || !suggestion.trim()) {
    res.status(400).json({ error: "original and suggestion required" });
    return;
  }
  const ok = saveCorrection(original, suggestion);
  res.status(200).json({ saved: ok });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }

  res.json(job);
});

app.get("/api/download/:file", async (req, res) => {
  const fileName = req.params.file;
  const filePath = path.join(config.generatedDir, fileName);
  const downloadName = req.query.name || fileName;
  const extension = path.extname(fileName).toLowerCase();

  try {
    console.log(`[download] Serving ${filePath}`);
    await fs.access(filePath);

    if (extension === ".pdf") {
      res.setHeader("Content-Type", "application/pdf");
    } else {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    }
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );
    res.setHeader("Cache-Control", "no-cache");
    const fileStream = require("fs").createReadStream(filePath);
    fileStream.pipe(res);
    fileStream.on("error", (error) => {
      console.error("[download] Stream error:", error.message);
      res.status(500).json({ error: "Download failed." });
    });
  } catch (error) {
    console.error("[download] File not found:", filePath);
    res.status(404).json({ error: "Generated file not found." });
  }
});

app.use((error, req, res, next) => {
  console.error("[express] Middleware error:", error.message);
  res.status(400).json({
    error: error.message || "Request failed.",
  });
});

async function start() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.mkdir(config.generatedDir, { recursive: true });

  app.listen(config.port, () => {
    console.log(`Huminzer backend running on http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
