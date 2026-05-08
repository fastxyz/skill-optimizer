---
name: firebase-hosting-basics
description: Skill for working with Firebase Hosting (Classic). Use this when you want to deploy static web apps, Single Page Apps (SPAs), or simple microservices. Do NOT use for Firebase App Hosting.
---

# hosting-basics

This skill provides instructions and references for working with Firebase Hosting, a fast and secure hosting service for your web app, static and dynamic content, and microservices.

## Overview

Firebase Hosting provides production-grade web content hosting for developers. With a single command, you can deploy web apps and serve both static and dynamic content to a global CDN (content delivery network).

**Key Features:**
- **Fast Content Delivery:** Files are cached on SSDs at CDN edges around the world.
- **Secure by Default:** Zero-configuration SSL is built-in.
- **Preview Channels:** View and test changes on temporary preview URLs before deploying live.
- **GitHub Integration:** Automate previews and deploys with GitHub Actions.
- **Dynamic Content:** Serve dynamic content and microservices using Cloud Functions or Cloud Run.

## Hosting vs App Hosting

**Choose Firebase Hosting if:**
- You are deploying a static site (HTML/CSS/JS).
- You are deploying a simple SPA (React, Vue, etc. without SSR).
- You want full control over the build and deploy process via CLI.

**Choose Firebase App Hosting if:**
- You are using a supported full-stack framework like Next.js or Angular.
- You need Server-Side Rendering (SSR) or ISR.
- You want an automated "git push to deploy" workflow with zero configuration.

## Instructions

### 1. Configuration (`firebase.json`)
For details on configuring Hosting behavior, including public directories, redirects, rewrites, and headers, see [configuration.md](references/configuration.md).

### 2. Deploying
For instructions on deploying your site, using preview channels, and managing releases, see [deploying.md](references/deploying.md).

### 3. Emulation
To test your app locally:
```bash
npx -y firebase-tools@latest emulators:start --only hosting
```
This serves your app at `http://localhost:5000` by default.

## Configuration Review

When auditing a `firebase.json` for compliance and best practices, review in **two passes** — both are required.

### Pass 1 — Visible bad values

Scan each key for incorrect values:

- `"public"`: must point to the **build output directory** (`dist` or `build`), NOT the source directory (`src`). Using `src` deploys unbuilt source files.
- `"cleanUrls"`: should be `true`. Setting it to `false` exposes `.html` extensions in all URLs.
- Redirect `"type"`: must be `301` (permanent) or `302` (temporary). The value `200` is **not a valid redirect type** and will cause errors.

### Pass 2 — Required but absent settings

The most-missed issues are about settings that should be present but are **missing entirely**. After Pass 1, check each section:

**`ignore` array** — must include all three default patterns:

```json
"ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
```

Missing `**/.*` exposes hidden files (`.env`, `.htaccess`). Missing `**/node_modules/**` uploads tens of thousands of dependency files.

**SPA catch-all rewrite** — if the project is a Single Page Application (React, Vue, Angular, etc.), the `rewrites` array MUST contain a catch-all rule:

```json
{ "source": "**", "destination": "/index.html" }
```

Without this rule, direct navigation to any deep link (e.g., `/dashboard`, `/profile/42`) returns a `404 Not Found` error from the CDN because no matching file exists. Client-side routing only works when the app is served from `index.html`.
