/**
 * Knowledge corpus ingestion pipeline.
 * Reads text files, applies 512-token recursive splits with 10-20% overlap,
 * generates contextual enrichment + embeddings, writes to corpus_chunks table.
 *
 * Usage:
 *   pnpm corpus:ingest --source "path/to/file.txt" --title "Cinematography Textbook" --type textbook
 */

import { readFile } from "node:fs/promises";

import OpenAI from "openai";
import { sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { loadLocalEnv } from "@/db/load-env";

loadLocalEnv();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHUNK_SIZE_TOKENS = 512;
const OVERLAP_RATIO = 0.15; // 15% overlap
const CORPUS_EMBEDDING_MODEL = "text-embedding-3-large";
const CORPUS_EMBEDDING_DIMENSIONS = 1536;

// Rough token estimate: ~4 chars per token
const CHARS_PER_TOKEN = 4;
const CHUNK_SIZE_CHARS = CHUNK_SIZE_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = Math.floor(CHUNK_SIZE_CHARS * OVERLAP_RATIO);

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function recursiveSplit(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE_CHARS;

    if (end >= text.length) {
      chunks.push(text.slice(start).trim());
      break;
    }

    // Try to break at paragraph, then sentence, then space
    const segment = text.slice(start, end + 200);
    const paraBreak = segment.lastIndexOf("\n\n", CHUNK_SIZE_CHARS);
    const sentenceBreak = segment.lastIndexOf(". ", CHUNK_SIZE_CHARS);
    const spaceBreak = segment.lastIndexOf(" ", CHUNK_SIZE_CHARS);

    if (paraBreak > CHUNK_SIZE_CHARS * 0.5) {
      end = start + paraBreak + 2;
    } else if (sentenceBreak > CHUNK_SIZE_CHARS * 0.5) {
      end = start + sentenceBreak + 2;
    } else if (spaceBreak > CHUNK_SIZE_CHARS * 0.3) {
      end = start + spaceBreak + 1;
    }

    chunks.push(text.slice(start, end).trim());
    start = end - OVERLAP_CHARS;
  }

  return chunks.filter((c) => c.length > 50);
}

// ---------------------------------------------------------------------------
// Contextual enrichment
// ---------------------------------------------------------------------------

async function generateContextStatement(
  chunk: string,
  sourceTitle: string,
  openai: OpenAI,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You generate a single concise sentence that situates a text chunk within its source document. This context will be prepended to the chunk before embedding to improve retrieval quality.",
      },
      {
        role: "user",
        content: `Source: "${sourceTitle}"\n\nChunk:\n${chunk.slice(0, 1000)}\n\nGenerate a single context sentence:`,
      },
    ],
    max_tokens: 100,
    temperature: 0,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

async function generateCorpusEmbedding(
  text: string,
  openai: OpenAI,
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: CORPUS_EMBEDDING_MODEL,
    input: text,
    dimensions: CORPUS_EMBEDDING_DIMENSIONS,
  });
  return response.data[0]!.embedding;
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------

async function ingestCorpus(
  sourcePath: string,
  sourceTitle: string,
  sourceType: string,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });

  console.log(`Reading ${sourcePath}...`);
  const text = await readFile(sourcePath, "utf-8");
  console.log(`  ${text.length} characters`);

  console.log("Splitting into chunks...");
  const chunks = recursiveSplit(text);
  console.log(`  ${chunks.length} chunks (${CHUNK_SIZE_TOKENS} tokens, ${OVERLAP_RATIO * 100}% overlap)`);

  console.log("Processing chunks...");
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`  [${i + 1}/${chunks.length}] `);

    // Generate contextual enrichment
    const contextStatement = await generateContextStatement(
      chunk,
      sourceTitle,
      openai,
    );

    // Embed with context prepended (Anthropic's contextual retrieval pattern)
    const textToEmbed = contextStatement
      ? `${contextStatement}\n\n${chunk}`
      : chunk;
    const embedding = await generateCorpusEmbedding(textToEmbed, openai);

    // Write to DB
    await db.insert(schema.corpusChunks).values({
      sourceTitle,
      sourceType,
      chunkIndex: i,
      content: chunk,
      contextStatement,
      embedding,
      searchText: chunk,
    });

    console.log(`✓ ${contextStatement.slice(0, 60)}...`);
  }

  console.log(`\nDone. ${chunks.length} chunks ingested from "${sourceTitle}".`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const sourceIdx = args.indexOf("--source");
const titleIdx = args.indexOf("--title");
const typeIdx = args.indexOf("--type");

if (sourceIdx === -1 || titleIdx === -1 || typeIdx === -1) {
  console.error(
    "Usage: pnpm corpus:ingest --source <path> --title <title> --type <textbook|paper|article|analysis>",
  );
  process.exit(1);
}

ingestCorpus(args[sourceIdx + 1], args[titleIdx + 1], args[typeIdx + 1]).catch(
  (err) => {
    console.error("Ingestion failed:", err);
    process.exit(1);
  },
);
