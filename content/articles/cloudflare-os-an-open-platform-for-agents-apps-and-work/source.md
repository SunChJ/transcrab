---
title: 'Cloudflare OS: an open platform for agents, apps, and work'
date: '2026-08-07T02:50:13.382Z'
sourceUrl: 'https://blog.cloudflare.com/cloudflare-os/'
lang: source
---
Every organization has a mission, a reason for being. Organizations pass that mission — along with their terminology, procedures, systems, standards, and ways of working — to their people. People, in turn, take this context together with their own experience and work towards the mission.

Work can take many forms, from code, to documents and slides, to relationships, to outcomes in the physical world.

Some of these are straightforward: code either runs or it doesn’t. Agents have been using this feedback loop to produce code that “works” for developers over the last couple of years. But what about the rest of us?

Bringing the same leverage to the rest of the organization is a harder problem. Agents need to understand the context of the company and be able to reach the systems people use to do their jobs. They need to turn that context and access into work that moves the organization towards its mission.

That’s why we created Cloudflare OS. It gives every person an agent and workspace built around their company: how it works, what it knows, and the systems it relies on.

In May of this year, we gave every person at Cloudflare access to the first version of Cloudflare OS. Thousands of people across every function, many of them outside of engineering, use it every day to create documents and slides, automate repeatable tasks, and build small apps to visualize data and help them do their work.

Cloudflare OS also gave everyone a shared library of context and skills built by teams at Cloudflare. It captures our terminology, procedures, and best-known ways of doing recurring work as instructions an agent can follow. When one person figures out a better way to do something, everyone else can use it.

**Today, we are open sourcing a new version of [Cloudflare OS](https://os.cloudflare.app/).** Any organization can deploy it, connect it to internal systems, and make it their own.

## What we learned from the first version

The Cloudflare OS we are open sourcing today is based on what we learned from running the first version internally, a journey our CIO, Sam Rhea, covers in his [blog post](https://blog.cloudflare.com/how-we-use-ai-with-cloudflare-os).

The first version centered on individuals working with agents through private workspaces. Apps were static rather than live software connected to internal systems, and mostly deterministic jobs still required running an agent skill again and consuming more model tokens.

Collaboration exposed a more fundamental challenge. Access to an [MCP server](https://www.cloudflare.com/learning/ai/what-is-model-context-protocol-mcp/) told us which tools an agent could call, but not which underlying resources the agent had observed. Once people began sharing workspaces, apps, and outputs, we needed to ensure that collaboration could not expose information someone was not permitted to see.

We rebuilt Cloudflare OS on a new foundation to solve these problems. Security had to be part of the platform, not something every person building an app or using an agent has to implement correctly.

The result is a platform designed to belong to the company running it. You can customize the interfaces, connect your tools, and add the skills and context that capture how your organization works.

## Introducing Cloudflare OS

Cloudflare OS starts with a conversation in your browser, like many other AI tools. What makes it different is that each conversation is grounded in the context and skills your organization has curated. Give your workspace a goal, and it can draw on that knowledge and work with the tools and data your organization already uses to achieve it.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=715&amp;h=477&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=640&amp;h=427&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=715&amp;h=477&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=750&amp;h=500&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=828&amp;h=552&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1080&amp;h=721&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1280&amp;h=854&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1430&amp;h=954&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 2.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY68A0TND85MN4AZCF3G.png&amp;w=1536&amp;h=1024&amp;f=webp" data-lightbox-width="1536" data-lightbox-height="1024" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="477"></p></figure>

Cloudflare OS combines three parts:

*   **An agent workspace** grounded in context and skills your company curates, with an isolated runtime where agents can write and run code.
*   **A new security and governance framework** for safe access to internal data and services.
*   **A platform for personal, modifiable apps** that people can build, share, and continue changing.

What begins as a conversation can become a doc, an app, or a workflow that continues doing the work.

## An agent workspace for everyone in your company

Agent workspaces were designed for everyone in your organization to use. You interact with them in your browser, so you don’t have to be a developer or know how to use a terminal. 

A workspace combines agent sessions, persistent state, outputs and files, resource access, and an isolated runtime where the agent can write and run code.

They come loaded with the curated context and skills your team or company has collected. No more reinventing the wheel for every task — if someone on your team has figured out the best way to do something, everyone benefits. People no longer have to explain the same process, terminology, and best practices to a model every time they start a task.

A few things you can do:

### Research and ask questions

Ask a workspace to research a topic using company context and the resources you make available to it. The agent can write code to search, filter, join, and analyze information instead of pulling an entire dataset into the model’s context window.

### Create docs, slides, and spreadsheets

A workspace can turn its research into a document, presentation, or spreadsheet that you can continue editing. These outputs do not have to be static files. They can remain connected to live data, be updated as their sources change, and still be exported to familiar formats or services such as Google Drive.

### Create collaborative, connected apps for your team

When a document or spreadsheet is not enough, the agent can build an app with its own interface, logic, and state. The app can use connected company resources and support multiple people working together.

### Run deterministic workflows 

Not every job needs a full agent session. Many are a known sequence of steps with one or two places where judgment is useful. A workspace can turn those jobs into mostly deterministic workflows, using code for the predictable steps and a model only where it adds value. Workflows can run on demand, on a schedule, or when an event occurs in a connected system.

Cloudflare OS gives agents and apps governed access to systems of record through Gatekeepers (more on this in the security section below). It also supports existing [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro) servers your organization already uses via [MCP Server Portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/).

## A new security and governance framework for safe access to internal data and services

As people begin experimenting with AI at work, one of their first requests is often for API keys to company systems. This makes sense: AI isn’t much use at work if it doesn’t have access to the systems people use to do their jobs.

But handing over API keys to people and agents is dangerous and does not scale. Keys often provide broad, long-lived access that is difficult to constrain, share safely, and audit.

MCP gives agents a better way to use these systems. An MCP server can hold the credential and expose a defined set of tools instead of handing the key directly to the agent. But controlling which tools an agent can call is only the first step. MCP alone does not tell us which underlying resources an agent has observed. The agent can combine information across systems, send it somewhere less restricted, or expose it through apps and outputs to people who may not be allowed to see the original resources. Authorization has to account for where the data can go next.

### Agents start with no access

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/) controls who can enter Cloudflare OS. Inside, every agent and app starts with access to nothing. An agent can ask for access to a specific resource, which you can grant or deny. Generated code receives that resource as a typed binding:

```
const issues = await env.PROJECT.listIssues({
  teamId: "ENG",
  state: "open",
});
```

`env.PROJECT` is a capability representing permission to use a specific resource under a specific policy. The credential remains completely isolated from the agent and any generated code.

Server code runs in a Dynamic Worker with global outbound networking disabled. Client code runs in a sandboxed frame in the browser. Neither can reach the Internet except through capabilities you explicitly provide.

### Gatekeepers govern resources and actions

A Gatekeeper is a service-specific [Worker](https://developers.cloudflare.com/workers/?_gl=1*1pzndf6*_gcl_au*MzM2MDkxNTQzLjE3ODQ4NDczOTM.*_ga*MWVkZWU3OTctMzJjNC00YWE1LWI2ZDUtZTJkNTY1NzYxYWQ0*_ga_SQCRB0TXZW*czE3ODUyMTk3NjMkbzckZzAkdDE3ODUyMTk3NjMkajYwJGwwJGgwJGRQeHAyTUEtdzgtVUFETUEzOGwtVFVhajVDd2laRWYxSC1R) that sits between Cloudflare OS and an external service. It understands the service’s API, its resources, and the operations that can be performed on them.

Giving an agent access to your entire GitHub account is likely too broad. A Gatekeeper can give it access to a single repository, allow it to read issues but not source code, mask particular fields, apply rate limits, and require approval before merging a pull request.

The agent and its apps see a small TypeScript API. The Gatekeeper handles [OAuth](https://www.cloudflare.com/learning/access-management/what-is-oauth/), holds the credential, enforces policy, records what was read, and mediates anything with an externally visible side effect.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=715&amp;h=413&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=640&amp;h=370&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=715&amp;h=413&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=750&amp;h=433&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=828&amp;h=478&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1080&amp;h=624&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1280&amp;h=739&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1430&amp;h=826&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 3.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXZJ8CW8K5Y8DBCBACM7.png&amp;w=1920&amp;h=1109&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1109" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="413"></p></figure>

### Policy follows what the agent has seen

Controlling the initial read is not enough. Take, for example, the case where an agent reads a sensitive table in a data warehouse and uses it to produce a live dashboard. Sharing the dashboard must not become a way to share the table with people who could not access it directly.

Cloudflare OS records every resource agents observe. These observations remain attached to the agent and its work. When another person tries to open the workspace, interact with the agent, or view what it produced, Gatekeepers verify that person's access to the observed resources.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=715&amp;h=463&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=640&amp;h=414&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=715&amp;h=463&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=750&amp;h=486&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=828&amp;h=536&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1080&amp;h=699&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1280&amp;h=829&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1430&amp;h=926&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 4.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDY5GTDXQJPAWC065WH87.png&amp;w=1920&amp;h=1244&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1244" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="463"></p></figure>

The same observation log is used to inform policies that determine when agents can make external requests. A read of sensitive data can prevent the agent from writing data to certain sources, inviting new collaborators, handing work to another agent, or making an outbound request.

People using agents or building apps do not have to worry about making these mistakes. The platform can now be used to handle this.

## A platform for building and sharing personal, modifiable apps

Most productivity suites give you a fixed set of applications: documents, spreadsheets, and presentations. In Cloudflare OS, each “file” can be its own application, written by an agent for one person, one project, or one team.

These are not prototypes that you have to export and deploy somewhere else. Each one is a full-stack application with client code, server code, an API, and durable state. Apps are private by default, but can be shared like documents.

### Every app is a Worker

When you ask your workspace to build an app, the agent writes two parts:

*   Client code that renders the app’s UI in the browser
*   Server code that stores state and implements the app’s behavior

The server is loaded on demand as a [Dynamic Worker](https://developers.cloudflare.com/dynamic-workers/) and instantiated as a [Durable Object Facet](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/) (both are features we built for this project). The facet gives the app its own SQLite database, separate from the Cloudflare OS runtime managing it. Dynamic Workers use lightweight V8 isolates, so every app can have its own isolated runtime without needing a dedicated server or container sitting around.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=715&amp;h=421&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=640&amp;h=377&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=715&amp;h=421&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=750&amp;h=442&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=828&amp;h=488&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1080&amp;h=636&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1280&amp;h=754&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1430&amp;h=842&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 5.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTESRQTCERH9MDPVGC3.png&amp;w=1920&amp;h=1131&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="1131" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="421"></p></figure>

The browser client talks to the server using [Cap’n Web](https://github.com/cloudflare/capnweb), Cloudflare’s open source object-capability Remote Procedure Call (RPC) system. A server method can be called from the client like a normal JavaScript function:

```
const issues = await app.listIssues({
 status: "done",
});
```

The special part is that the agent can also call the same method.

**So if you can build a tool to do a job yourself, agents can use your tool to do the job when you’re not there.**

### Share the app, or share how it was built

When you build an app in Cloudflare OS, you have two ways to share them:

*   Sharing your app itself lets other people collaborate in real time using the same state.
*   Sharing a blueprint of your app lets other people create their own copy of your app.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=715&amp;h=284&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=640&amp;h=254&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=715&amp;h=284&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=750&amp;h=298&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=828&amp;h=329&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1080&amp;h=429&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1280&amp;h=508&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1430&amp;h=568&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 6.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXN0ZTW8DZZ0VC98Z0AP.png&amp;w=1920&amp;h=764&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="764" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="284"></p></figure>

An app instantiated from a blueprint contains the original app’s code. But it does not contain its SQLite data, conversation history, credentials, or connected resources. Each new app starts with independent state and resources.

This means when you share apps with your team, they can modify them themselves with AI instead of filing a feature request and assigning you.

## Use any model, and control what it costs

Cloudflare OS can be used with any model. Every inference call runs through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/), giving your organization one place to decide which models are available and which model should handle each job.

<figure data-astro-cid-7nvefuv6=""><p><img src="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=715&amp;h=332&amp;f=webp&amp;fit=cover&amp;position=center" srcset="https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=640&amp;h=297&amp;f=webp&amp;fit=cover&amp;position=center 640w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=715&amp;h=332&amp;f=webp&amp;fit=cover&amp;position=center 715w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=750&amp;h=348&amp;f=webp&amp;fit=cover&amp;position=center 750w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=828&amp;h=384&amp;f=webp&amp;fit=cover&amp;position=center 828w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1080&amp;h=501&amp;f=webp&amp;fit=cover&amp;position=center 1080w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1280&amp;h=594&amp;f=webp&amp;fit=cover&amp;position=center 1280w, https://blog.cloudflare.com/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1430&amp;h=664&amp;f=webp&amp;fit=cover&amp;position=center 1430w" alt="BLOG-3379 7.png" loading="lazy" decoding="async" data-image-placeholder-media="true" data-lightbox-src="/_image?href=https%3A%2F%2Fblog.cloudflare.com%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01KZ7PDXTSXP67QP4M7F21B9V1.png&amp;w=1920&amp;h=891&amp;f=webp" data-lightbox-width="1920" data-lightbox-height="891" data-astro-cid-7nvefuv6="true" sizes="(min-width: 715px) 715px, 100vw" data-astro-image="constrained" data-astro-image-fit="cover" data-astro-image-pos="center" width="715" height="332"></p></figure>

Not every task needs the most expensive model. You may not want to run the most expensive frontier model to summarize your unread emails every morning. AI Gateway gives you the control needed to make sure expensive models are only being used for the hardest work.

Every request is attributed to the person, team, or workspace that made it. Administrators can see where inference spend is going, set budgets and rate limits, and decide what happens when a limit is reached. 

## Open source, so you can make it yours

Cloudflare OS is available today and is open source. Check out the [cloudflare-os GitHub repository](https://github.com/cloudflare/cloudflare-os). You can deploy it into your own Cloudflare account and use your own Access policies, AI Gateway configuration, data, and integrations.

Our internal deployment reflects Cloudflare’s systems, terminology, policies, and ways of working. Yours should reflect your organization.

Cloudflare OS is designed so you can customize the interface, add internal Gatekeepers, and build organization-specific features without changing the core product.

We are releasing two repositories: the [Cloudflare OS core](https://github.com/cloudflare/cloudflare-os) and an [example deployment](https://github.com/cloudflare/cloudflare-os-starter) based on how we run it internally at Cloudflare. The deployment repository consumes the core without patching it, providing a place for configuration, custom UI, internal integrations, analytics, and deployment pipelines.

## Delivered together with our partners

The source code is only the starting point. The context, skills, workflows, internal systems, and policies are what make Cloudflare OS even more useful for your organization.

Cloudflare’s strategic partners, Presidio and Happy Cog, will work with you to customize Cloudflare OS around how your organization operates and roll it out across your workforce.

Partners can help you curate shared skills and institutional context, build custom interfaces, connect internal systems through Gatekeepers and MCP Server Portals, and configure security, model, and cost controls.

You get your own branded Cloudflare OS, connected to your systems, running on Cloudflare, and shaped around how your people actually work.

## Get started

Cloudflare OS is available today on [GitHub](https://github.com/cloudflare/cloudflare-os). You can explore the source code, try the demo, or deploy it into your own Cloudflare account in a few minutes using our [starter repository](https://github.com/cloudflare/cloudflare-os-starter).

We’re just getting started. We’re working on bringing Cloudflare OS to the Cloudflare dashboard as a fully managed product, adding containers for development workflows, and bringing workspaces into Slack and other chat tools.

If you’re interested in talking with our team, we would love to chat. Use [this form](https://www.cloudflare.com/resource/cloudflare-os-interest-landing-page/) to reach out!
