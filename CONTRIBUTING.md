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
data:
    - characters
        - (all character jsons)
    - weapons
        - (all weapons jsons)
routes:
    - (has all routes related to different features)
middlewares:
    - (all middlewares to be used in project go here)
index.js: The entry point to the web server.

```

2. If you just want to add a new character, weapons or boss etc., you'll just need to understand the `data` folder.

## Local setup

1. Clone the repo and run `npm install`, that's basically it.
2. Add a `.env` file, and inside it, add `PORT=5000` (or any port you wish).
3. To start the server locally, run `nodemon`.
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

2. For images, go to [genshin-wiki image upload (work-in-progess)](https://genshin-impact-wiki.vercel.app/submit-image).
   ![text fields](https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev/extras/img-upload-fields.png)

   -  Enter name of character whose image you want to upload.
   -  Select the images.
   -  Upload and wait for all images to upload (time depends on your internet speed).
   -  You'll see a list of all images uploaded with their public profile.
      ![public urls of images uploaded](https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev/extras/urls.png)
   -  You can simply paste the url for the characters you're adding.

3. Add the [character].json in `/data/assets/characters` and open a PR. One of the maintainers (as of now just me) will review and merge the PR.

### Weapon
