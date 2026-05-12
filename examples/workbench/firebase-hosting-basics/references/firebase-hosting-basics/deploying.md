# Firebase Hosting Deployment Guide

## Standard Deployment

Execute `npx -y firebase-tools@latest deploy --only hosting` to push content to your default sites at `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com`.

## Preview Channels

Preview channels allow you to test changes on a temporary URL before going live.

Deploy using:
```bash
npx -y firebase-tools@latest hosting:channel:deploy CHANNEL_ID
```

This generates a preview URL like `PROJECT_ID--CHANNEL_ID-RANDOM_HASH.web.app`.

By default, channels expire after 7 days unless you customize the timeframe using the `--expires` flag (e.g., `--expires 1d`).

## Promoting to Live

Use the cloning command to move a preview channel version to production without rebuilding:
```bash
npx -y firebase-tools@latest hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

For example, to promote a `feature-beta` channel to your live site:
```bash
npx -y firebase-tools@latest hosting:clone my-app:feature-beta my-app:live
```
