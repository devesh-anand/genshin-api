# Contribution guidelines:

**Contents**

-  [Getting Started](#getting-started)
-  [Local setup](#local-setup)
-  [Adding a new character/weapon](#adding-a-new-entry)
-  [Adding a new weapon](#getting-started)
-  [Getting Started](#getting-started)

## Getting started

1. If you're new to git and GitHub, go through [The beginner’s guide to Git & GitHub](https://www.freecodecamp.org/news/the-beginners-guide-to-git-github/) first, then feel free to come back and contribute to this repo.
2. Understand the project structure:

```
data/          game data JSON (characters, weapons, artifacts, materials, enemies)
features/      one folder per feature: service.js (logic), store.js (data), rest.js (routes), tests
lib/           shared helpers (data store, name resolver, errors, paths)
middlewares/   Express middleware (rate limit, caching, errors)
app.js         builds the app and mounts every feature's routes
index.js       entry point — starts the server
```

See [CLAUDE.md](./CLAUDE.md) for code conventions and the "adding a feature" checklist.

2. If you just want to add a new character, weapons or boss etc., you'll just need to understand the `data` folder.

## Local setup

1. Clone the repo and run `npm install`, that's basically it.
2. Copy `.env.example` to `.env` (sets `PORT=5000`; change it if you wish).
3. To start the server locally, run `npm run dev`. Run `npm test` before opening a PR.
4. You'll be able to access the routes on `localhost:PORT` (PORT here is whatever PORT you set up in `.env`).

## Adding a new entry

**NOTE: Make sure the data you submit is correct. While PR review, if the data found will be incorrect, there's a good chance the PR will not be accepted.**
**List:**

-  [Character](#character)
-  [Weapon](#weapon)

### Character

Note: For reference, we'll take character details of xiao

1. Each character needs these fields:

```
name
title
vision
weapon
nation
affiliation
rarity
constellation
birthday
description
skillTalents:
    - name
    - unlock
    - description
    - upgrades:
        - name
        - value
    - type
    - img
passiveTalents:
    - name
    - unlock
    - description
    - level
    - img
constelltaions:
    - name
    - unlock
    - description
    - level
    - img
vision_key
weapon_type
img:
    - card
    - constellation
    - banner
    - icon
    - icon-big
    - portrait
```

2. For images, you don't need to upload anything. Leave the `img` fields empty. The maintainer uploads images to the image bucket with the sync scripts and fills in the URLs before merging. If you know a good source for an image, link it in the PR description.

3. Add the [character].json in `/data/characters` and open a PR. One of the maintainers (as of now just me) will review and merge the PR.

### Weapon
