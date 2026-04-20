---
title: 'Artifacts: versioned storage that speaks Git'
date: '2026-04-20T10:00:57.840Z'
sourceUrl: 'https://blog.cloudflare.com/artifacts-git-for-agents-beta/'
lang: source
---
2026-04-16

9 min read

![](https://cf-assets.www.cloudflare.com/zkvhlag99gkb/3mZ163MhASDRQW86DQm86r/2e89a01820f1b0a87af22d18208f470c/BLOG-3269_1.png)

Agents have changed how we think about source control, file systems, and persisting state. Developers and agents are generating more code than ever — more code will be written over the next 5 years than in all of programming history — and it’s driven an order-of-magnitude change in the scale of the systems needed to meet this demand. Source control platforms are especially struggling here: they were built to meet the needs of humans, not a 10x change in volume driven by agents who never sleep, can work on several issues at once, and never tire.

We think there’s a need for a new primitive: a distributed, versioned filesystem that’s built for agents first and foremost, and that can serve the types of applications that are being built today.

We’re calling this Artifacts: a versioned file system that speaks Git. You can create repositories programmatically, alongside your agents, sandboxes, Workers, or any other compute paradigm, and connect to it from any regular Git client.

Want to give every agent session a repo? Artifacts can do it. Every sandbox instance? Also Artifacts. Want to create 10,000 forks from a known-good starting point? You guessed it: Artifacts again. Artifacts exposes a REST API and native Workers API for creating repositories, generating credentials, and commits for environments where a Git client isn’t the right fit (i.e. in any serverless function).

Artifacts is available in private beta and we’re aiming to open this up as a public beta by early May.

```typescript
// Create a repo
const repo = await env.AGENT_REPOS.create(name)
// Pass back the token & remote to your agent
return { repo.remote, repo.token }
```
```bash
# Clone it and use it like any regular git remote
$ git clone https://x:${TOKEN}@123def456abc.artifacts.cloudflare.net/git/repo-13194.git
```

That’s it. A bare repo, ready to go, created on the fly, that any git client can operate it against.

And if you want to bootstrap an Artifacts repo from an existing git repository so that your agent can work on it independently and push independent changes, you can do that too with .import():

```typescript
interface Env {
  ARTIFACTS: Artifacts
}

export default {
  async fetch(request: Request, env: Env) {
    // Import from GitHub
    const { remote, token } = await env.ARTIFACTS.import({
      source: {
        url: "https://github.com/cloudflare/workers-sdk",
        branch: "main",
      },
      target: {
        name: "workers-sdk",
      },
    })

    // Get a handle to the imported repo
    const repo = await env.ARTIFACTS.get("workers-sdk")

    // Fork to an isolated, read-only copy
    const fork = await repo.fork("workers-sdk-review", {
      readOnly: true,
    })

    return Response.json({ remote: fork.remote, token: fork.token })
  },
}
```

[Check out the documentation](https://developers.cloudflare.com/artifacts/) to get started, or if you want to understand how Artifacts is being used, how it was built, and how it works under the hood: read on.

## Why Git? What’s a versioned file system?

Agents know Git. It’s deep in the training data of most models. The happy path *and* the edge cases are well known to agents, and code-optimized models (and/or harnesses) are particularly good at using git.

Further, Git’s data model is not only good for source control, but for *anything* where you need to track state, time travel, and persist large amounts of small data. Code, config, session prompts and agent history: all of these are things (“objects”) that you often want to store in small chunks (“commits”) and be able to revert or otherwise roll back to (“history”). 

We could have invented an entirely new, bespoke protocol… but then you have the bootstrap problem. AI models don’t know it, so you have to distribute skills, or a CLI, or hope that users are plugged into your docs MCP… all of that adds friction. If we can just give agents an authenticated, secure HTTPS Git remote URL and have them operate as if it were a Git repo, though? That turns out to work pretty well. And for non-Git-speaking clients — such as a Cloudflare Worker, a Lambda function, or a Node.js app — we’ve exposed a REST API and (soon) language-specific SDKs. Those clients can also use [isomorphic-git](https://isomorphic-git.org/), but in many cases a simpler TypeScript API can reduce the API surface needed.

### Not just for source control

Artifacts’ Git API might make you think it’s just for source control, but it turns out that the Git API and data model is a powerful way to persist state in a way that allows you to fork, time-travel and diff state for *any* data.

Inside Cloudflare, we’re using Artifacts for our internal agents: automatically persisting the current state of the filesystem *and* the session history in a per-session Artifacts repo. This enables us to:

*   Persist sandbox state without having to provision (and keep) block storage around.
    
*   Share sessions with others and allow them to time-travel back through both session (prompt) state *and* file state, irrespective of whether there were commits to the “actual” repository (source control).
    
*   And the best: *fork* a session from any point, allowing our team to share sessions with a co-worker and have them pick it up from them. Debugging something and want another set of eyes? Send a URL and fork it. Want to riff on an API? Have a co-worker fork it and pick up from where you left off.
    

We’ve also spoken to teams who want to use Artifacts in cases where the Git protocol isn’t a requirement at all, but the semantics (reverting, cloning, diffing) *are*. Storing per-customer config as part of your product, and want the ability to roll back? Artifacts can be a good representation of this.

We’re excited to see teams explore the non-Git use-cases around Artifacts just as much as the Git-focused ones.

## Under the hood

Artifacts are built on top of Durable Objects. The ability to create millions (or tens of millions+) of instances of stateful, isolated compute is inherent to how Durable Objects work today, and that’s exactly what we needed for supporting millions of Git repos per namespace.

Major League Baseball (for live game fan-out), Confluence Whiteboards, and our own [Agents SDK](https://developers.cloudflare.com/agents/) use Durable Objects under the hood at significant scale, and so we’re building this on a primitive that we’ve had in production for some time.

What we did need, however, was a Git server implementation that could run on Cloudflare Workers. It needed to be small, as complete as possible, extensible ([notes](https://git-scm.com/docs/git-notes), [LFS](https://git-lfs.com/)), and efficient. So we built one in [Zig](https://ziglang.org/), and compiled it to Wasm.

Why did we use Zig? Three reasons:

1.   The entire git protocol engine is written in pure Zig (no libc), compiled to a ~100KB WASM binary (with room for optimization!). It implements SHA-1, zlib inflate/deflate, delta encoding/decoding, pack parsing, and the full git smart HTTP protocol — all from scratch, with zero external dependencies other than the standard library.
    
2.   Zig gives us  manual control over memory allocation which is important in constrained environments like Durable Objects. The Zig Build System lets us easily share  code between the WASM runtime (production) and native builds (testing against libgit2 for correctness verification).
    
3.  The WASM module communicates with the JS host via a thin callback interface: 11 host-imported functions for storage operations (host\_get\_object, host\_put\_object, etc.) and one for streaming output (host\_emit\_bytes). The WASM side is fully testable in isolation.
    

Under the hood, Artifacts also uses R2 (for snapshots) and KV (for tracking auth tokens):

<figure><img src="https://cf-assets.www.cloudflare.com/zkvhlag99gkb/35SxJbQfntIscpotc0GBt8/48ae11213d7483c9b488321baacf78e7/BLOG-3269_2.png" alt="BLOG-3269 2" width="1800" height="1000" loading="lazy"></figure>

`*How Artifacts works (Workers, Durable Objects, and WebAssembly)*`

A Worker acts as the front-end, handling authentication & authorization, key metrics (errors, latency) and looking up each Artifacts repository (Durable Object) on the fly. 

Specifically:

*   Files are stored in the underlying Durable Object’s SQLite database.
    
    *   Durable Object storage has a 2MB max row size, so large Git objects are chunked and stored across multiple rows.
        
    *   We make use of the sync KV API (state.storage.kv)  which is backed by SQLite under the hood.
        
*    DOs have ~128MB memory limits: this means we can spawn tens of millions of them (they’re fast and light) but have to work within those limits.
    
    *   We make heavy use of streaming in both the fetch and push paths, directly returning a \`ReadableStream<Uint8Array>\` built from the raw WASM output chunks.
        
    *   We avoid calculating our own git deltas, instead,  the raw deltas and base hashes are persisted alongside the resolved object. On fetch, if the requesting client already has the base object, Zig emits the delta instead of the full object, which saves bandwidth *and* memory.
        
*   Support for both v1 and v2 of the git protocol.
    
    *   We support capabilities including ls-refs, shallow clones (deepen, deepen-since, deepen-relative), and incremental fetch with have/want negotiation.
        
    *   We have an extensive test suite with conformance tests against git clients and verification tests against a libgit2 server designed to validate protocol support.
        

On top of this, we have native support for [git-notes](https://git-scm.com/docs/git-notes). Artifacts is designed to be agent-first, and notes enable agents to add notes (metadata) to Git objects. This includes prompts, agent attribution and other metadata that can be read/written from the repo without mutating the objects themselves.

## Big repos, big problems? Meet ArtifactFS.

Most repos aren’t that big, and Git is [designed to be extremely efficient](https://github.blog/open-source/git/gits-database-internals-i-packed-object-store/) in terms of storage: most repositories take only a few seconds to clone at most, and that’s dominated by network setup time, auth, and [checksumming](https://git-scm.com/book/ms/v2/Git-Internals-Git-Objects). In most agent or sandbox scenarios, that’s workable: just clone the repo as the sandbox starts and get to work.

But what about a multi-GB repository and/or repos with millions of objects? How can we clone that repo quickly, without blocking the agent’s ability to get to work for minutes and consuming compute?

A popular web framework (at 2.4GB and with a long history!) takes close to 2 minutes to clone. A shallow clone is faster, but not enough to get down to single digit seconds, and we don’t always want to omit history (agents find it useful).

Can we get large repos down to ~10-15 seconds so that our agent can get to work? Well, yes: with a few tricks.

As part of our launch of Artifacts, [we’re open-sourcing ArtifactFS](https://github.com/cloudflare/artifact-fs), a filesystem driver designed to mount large Git repos as quickly as possible, hydrating file contents on the fly instead of blocking on the initial clone. It's ideal for agents, sandboxes, containers and other use cases where startup time is critical. If you can shave ~90-100 seconds off your sandbox startup time for every large repo, and you’re running 10,000 of those sandbox jobs per month: that’s 2,778 sandbox hours saved.

You can think of ArtifactFS as “Git clone but async”:

*   ArtifactFS runs a blobless clone of a git repository: it fetches the file tree and refs, but not the file contents. It can do that during sandbox startup, which then allows your agent harness to get to work.
    
*   In the background, it starts to hydrate (download) file contents concurrently via a lightweight daemon.
    
*   It prioritizes files that agents typically want to operate on first: package manifests (`package.json, go.mod`), configuration files, and code, deprioritizing binary blobs (images, executables and other non-text-files) where possible so that agents can scan the file tree as the files themselves are hydrated.
    
*   If a file isn’t fully hydrated when the agent tries to read it, the read will block until it has.
    

The filesystem does not attempt to “sync” files back to the remote repository: with thousands or millions of objects, that’s typically very slow, and since we’re speaking git, we don’t need to. Your agent just needs to commit and push, as it would with any repository. No new APIs to learn.

Importantly, ArtifactFS works with any Git remote, not just our own Artifacts. If you’re cloning large repos from GitHub, GitLab, or self-hosted Git infrastructure: you can still use ArtifactFS.

## What’s coming?

Our release today is just the beta, and we’re already working on a number of features that you’ll see land over the next few weeks:

*   Expanding the [available metrics](https://developers.cloudflare.com/artifacts/observability/metrics/) we expose. Today we’re shipping metrics for key operations counts per namespace, repo and stored bytes per repo, so that managing millions of Artifacts isn’t toilsome.
    
*   Support for [Event Subscriptions](https://developers.cloudflare.com/queues/event-subscriptions/) for repo-level events so that we can emit events on pushes, pulls, clones, and forks to any repository within a namespace. This will also allow you to consume events, write webhooks, and use those events to notify end-users, drive lifecycle events within your products, and/or run post-push jobs (like CI/CD).
    
*   Native TypeScript, Go and Python client SDKs for interacting with the Artifacts API
    
*   Repo-level search APIs and namespace-wide search APIs, e.g. “find all the repos with a `package.json` file”. 
    

We’re also planning an API for [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), allowing you to run CI/CD jobs on any agent-driven workflow.

## What will it cost me?

We’re still early with Artifacts, but want our pricing to work at agent-scale: it needs to be cost effective to have millions of repos, unused (or rarely used) repos shouldn’t be a drag, and our pricing should match the massively-single-tenant nature of agents.

You also shouldn’t have to think about whether a repo is going to be used or not, whether it’s hot or cold, and/or whether an agent is going to wake it up. We’ll charge you for the storage you consume and the operations (e.g. clones, forks, pushes & pulls) against each repo.

**$/unit**

**Included**

**Operations**

$0.15 per 1,000 operations

First 10k included (per month)

**Storage**

$0.50/GB-mo

First 1GB included.

Big, busy repos will cost more than smaller, less-often-used repos, whether you have 1,000, 100,000, or 10 million of them.

We’ll also be bringing Artifacts to the Workers Free plan (with some fair limits) as the beta progresses, and we’ll provide updates throughout the beta should this pricing change and ahead of billing any usage.

## Where do I start? 

<figure><img src="https://cf-assets.www.cloudflare.com/zkvhlag99gkb/3xLMMKCN1HNGWbkSyq0tDZ/2a8d49383957804f3ce204783e11ae80/BLOG-3269_3.png" alt="BLOG-3269 3" width="1999" height="1125" loading="lazy"></figure>

Artifacts is launching in private beta, and we expect public beta to be ready in early May (2026, to be clear!). We’ll be allowing customers in progressively over the next few weeks, and [you can register interest for the private beta](https://forms.gle/DwBoPRa3CWQ8ajFp7) directly.

In the meantime, you can learn more about Artifacts by:

*   Reading the [getting started guide](https://developers.cloudflare.com/artifacts/get-started/workers/) in the docs.
    
*   Visiting the Cloudflare dashboard (Build > Storage & Databases > Artifacts)
    
*   Reading through the [REST API examples](https://developers.cloudflare.com/artifacts/api/rest-api/)
    
*   Learning more about [how Artifacts works](https://developers.cloudflare.com/artifacts/concepts/how-artifacts-works/) under the hood
    

Follow [the changelog](https://developers.cloudflare.com/changelog/product/artifacts/) to track the beta as it progresses.

## Watch on Cloudflare TV

Cloudflare's connectivity cloud protects [entire corporate networks](https://www.cloudflare.com/network-services/), helps customers build [Internet-scale applications efficiently](https://workers.cloudflare.com/), accelerates any [website or Internet application](https://www.cloudflare.com/performance/accelerate-internet-applications/), [wards off DDoS attacks](https://www.cloudflare.com/ddos/), keeps [hackers at bay](https://www.cloudflare.com/application-security/), and can help you on [your journey to Zero Trust](https://www.cloudflare.com/products/zero-trust/).

Visit [1.1.1.1](https://one.one.one.one/) from any device to get started with our free app that makes your Internet faster and safer.

To learn more about our mission to help build a better Internet, [start here](https://www.cloudflare.com/learning/what-is-cloudflare/). If you're looking for a new career direction, check out [our open positions](https://www.cloudflare.com/careers).

[Agents Week](https://blog.cloudflare.com/tag/agents-week/)[Agents](https://blog.cloudflare.com/tag/agents/)[GitHub](https://blog.cloudflare.com/tag/github/)[Cloudflare Workers](https://blog.cloudflare.com/tag/workers/)[Storage](https://blog.cloudflare.com/tag/storage/)[Developer Platform](https://blog.cloudflare.com/tag/developer-platform/)[Developers](https://blog.cloudflare.com/tag/developers/)
