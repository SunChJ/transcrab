---
title: You're doing RAG wrong
date: '2026-05-15T02:27:07.262Z'
sourceUrl: >-
  https://x.com/akshay_pachaar/status/2052743644411765230?s=12&t=oDjsBy-f-VCdrYC6Q655dA
lang: source
---
There's a new approach that:

- cuts corpus size by 40x.
- reduces tokens per query by 3x.
- improves vector search relevance by 2.3x.
And it doesn't touch your retrieval algorithm, your reranker, or your embedding model. It fixes something upstream that almost no one examines.

Every RAG pipeline starts with the same assumption: a chunk of text is the right unit of knowledge to embed.

That assumption is almost never examined.

And it's the source of most of the retrieval failures people try to fix downstream.

Why the Chunk Is a Bad Unit

A chunk of text is a structurally neutral container. It knows nothing about:

- where its ideas begin or end
- which version of a document it came from
- who is allowed to see it
Since a chunk has no idea boundary, the splitter cuts wherever the token count runs out.

![](https://pbs.twimg.com/media/HHy_-Y-aQAAALNV.jpg)

You end up retrieving half a table, or a conclusion with no argument, or a claim stripped of the context that makes it true. The model has no way to know what’s missing.

The version problem is just as bad.

Most enterprise corpora have the same document in a dozen near-identical versions across SharePoint, Confluence, and Git.

Top-K retrieval returns five copies of the same paragraph, current and deprecated mixed together. The LLM blends them into an answer that’s confidently wrong.

Because the chunk carries no metadata either, there’s nowhere to attach access control in the data itself.

Role filters, version state, clearance level: all of that ends up as logic bolted onto the orchestrator, disconnected from the content it’s supposed to govern.

LangChain, LlamaIndex, and Haystack sit above all of this. They orchestrate retrieval from whatever you put in the vector store.

Most stacks have nothing between the document parser and the vector store.

That gap is where all three problems compound.

A Better Unit: The Question-Answer Packet

The chunk fails because it’s structurally agnostic. The fix is to make the unit of knowledge structurally explicit.

Instead of embedding a window of prose, you embed a claim: one question, its validated answer, and governance fields as typed schema.

One fact per unit, nothing more.

![](https://pbs.twimg.com/media/HHzAEyfbsAANN-G.jpg)

Your queries are already questions. When your index stores answers to questions, the match becomes structural, not just semantic.

You’re not hoping the right paragraph floats to the top. You’re matching a question to its answer directly.

[Blockify](https://github.com/iternal-technologies-partners/blockify-agentic-data-optimization), a preprocessing layer from Iternal Technologies, implements this as a structure it calls an IdeaBlock: a question, its validated answer, and typed governance fields like clearance level, version state, and source, all on the same object.

It mirrors the shape of how users actually query a RAG system, as questions.

The key insight: when you embed a question-answer packet instead of a text window, your embedding represents a single atomic claim, not a chunk of narrative that happens to contain it.

This has a measurable consequence on vector geometry.

In Blockify’s internal benchmark across 17 documents and 298 pages, the average cosine distance from query to best-matching block was 0.1585 for IdeaBlocks versus 0.3624 for naive chunks.

That’s a 2.29x reduction in retrieval distance.

The counterintuitive finding: less data, more accuracy

Most people expect that shrinking the corpus hurts retrieval.

That’s not what happens with semantic distillation.

In Blockify’s internal benchmark, the pipeline produced 2,042 raw IdeaBlocks from the source documents.

![](https://pbs.twimg.com/media/HHzBLQ4acAAoTWY.jpg)

After iterative deduplication at 80-85% similarity across 3-5 rounds:

- 2,042 blocks collapsed to 1,200 canonical IdeaBlocks
- Word count dropped from 88,877 to 44,537
- Distilled dataset outperformed undistilled by 13.55% on vector accuracy
The reason redundant copies hurt rather than help: fifteen near-duplicates of the same paragraph create fifteen competing vectors in the same region of embedding space.

Retrieval distributes probability mass across all of them, pulling the match score down for the canonical version. Collapse them into one canonical block and the signal sharpens.

Your vector index isn’t a hard drive you want to fill. It’s a retrieval surface, and redundancy degrades it.

The pipeline: Documents to IdeaBlocks

The fix is a preprocessing pipeline that runs before anything touches the vector store.

Blockify’s processing runs in seven stages. Each stage has a defined input and output, so failures are localizable and reproducible.

![](https://pbs.twimg.com/media/HHzBQsHaQAAEZb7.jpg)

## Stage 1: Scoping

Before any document is parsed, you define the index hierarchy: Organization > Business Unit > Product > Persona.

This determines which blocks get tagged to which access tier and shapes how deduplication runs later.

## Stage 2: Ingestion

Documents enter as DOCX, PDF, PPT, PNG/JPG, Markdown, or HTML.

The parser hands off to the LLM layer, running fine-tuned LLaMA 3/QWEN 3.5/Gemma4 (and other custom foundation model variants), which converts raw chunks into draft IdeaBlocks: one critical question, one validated answer of two to three sentences, and typed governance fields.

Input size is bounded at 1,000 to 4,000 characters, with 2,000 as the practical midpoint.

## Stage 3: Chunking and extraction

Context-aware splitting means the LLM converts chunks to draft IdeaBlocks rather than cutting on token count alone. The output of each chunk is a question-answer pair, not a window of prose.

## Stage 4: Semantic deduplication

This is where the retrieval surface gets cleaned.

Blocks are clustered by cosine similarity at an 80-85% threshold across three to five iterative rounds.

Near-duplicates merge into a single canonical block via a second specially tuned LLM. The pipeline is optimized for GPU, but you can also run it on extra CPU capacity via the Intel Xeon optimized version.

The result is a dataset where every vector in the index represents a distinct claim, not one of fifteen near-identical copies competing for the same retrieval slot.

## Stage 5: Auto-tagging

Each block receives typed metadata: clearance level (PUBLIC, INTERNAL, CONFIDENTIAL, SECRET), version state (Current, Deprecated, Draft, Approved), product line, export control flags, and data privacy labels. Applied by the pipeline, not the document author.

## Stage 6: Human validation

A product corpus of 2,000 to 3,000 IdeaBlocks splits across five to ten SMEs, each spending one to two hours per quarter on their slice. Structured claims with source citations attached, not raw documents.

## Stage 7: Export

Validated blocks push to the vector database via API or export as JSON-L. Supported vector stores: Azure AI Search, Pinecone, Milvus, Vertex Matching Engine. Supported embedding models: OpenAI, Bedrock, Mistral, Jina, open-source.

The pipeline sits between document parser and vector store regardless of which combination is in use.

What Changes at the Application Layer

The unit you embed determines what the application layer can do.

![](https://pbs.twimg.com/media/HHzBd8QbYAA3E49.jpg)

- Query construction gets simpler: your queries are already questions. When the index stores answers to questions, the match is structural rather than probabilistic. You stop tuning similarity thresholds to compensate for semantic mismatch between query shape and document shape.
- Governance moves into the data layer: role-based access, version state, clearance level are typed fields on each block, not logic bolted onto the orchestrator. A sales engineer querying the same index as a legal reviewer gets a different dataset not because the retrieval layer filters it, but because the blocks themselves carry the access boundary.
- Updates propagate from a single record: when a spec changes, you update one IdeaBlock. Every application querying that block gets the corrected answer on the next request. With naive chunking, the same fact lives in dozens of near-duplicate passages across multiple documents. Updating it means finding all of them, which at enterprise scale is not a tractable problem.
The architecture doesn’t change how you query. It changes what you can trust about the answer.

The Underlying Principle

The chunk is a parsing convenience that became a retrieval assumption.

It has no idea boundary, version context or access state. Retrieval stacks have spent years patching that mismatch: rerankers, hybrid search, threshold tuning, prompt engineering.

All of it downstream of the real problem.

The fix is not a better retrieval algorithm. It’s a better unit.

RAG stacks are beginning to grow a distillation layer between parsing and vectorization, the way web stacks grew a CDN layer between origin and browser.

You can build it yourself with clustering, LLM-based summarization, and schema enforcement. Or you can use something purpose-built for it like Blockify.

Either way, the chunk-as-unit assumption is the bug, and fixing it at the data layer pays off more than tuning retrieval ever will.

It's open-source!

[Try it yourself here→](https://github.com/iternal-technologies-partners/blockify-agentic-data-optimization)

Thanks for reading!

If you found it insightful, reshare with your network.

Find me →[@akshay_pachaar](https://x.com/@akshay_pachaar) ✔️

For more insights and tutorials on LLMs, AI Agents, and Machine Learning!
