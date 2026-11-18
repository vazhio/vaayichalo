# വായിച്ചാലോ? (Shall We Read?): prototype

A daily Malayalam reading site: one poem, one essay and one story every day, plus a forgiving 1,000-day reading tracker. It's inspired heavily by bradburychallenge.org.

There is no build step, nothing to install and no database. It's just these files.

## What's in this folder

```
index.html              the page
style.css               colours, fonts, layout
app.js                  the logic (daily schedule, tracker, archive). You rarely need to touch this.
content/
  library.json          settings + the ORDER in which texts appear
  alankaram.json        "figure of speech of the day" entries
  texts/*.txt           one file per poem / essay / story
  manifest.json         the Wikisource pages behind days 8–30, used by the automatic download
tools/fetch-texts.mjs   downloads any missing text listed in manifest.json
.github/workflows/      GitHub's instructions: download missing texts, then publish the site
```

## Adding a new text (the only thing you'll do often)

1. Copy any file in `content/texts/`, for example `veenapoovu.txt`, and give it a new name in English letters with dashes, such as `chandalabhikshuki.txt`.
2. Edit the header at the top. Keep the `key: value` format, and keep the `---` line that separates the header from the text:

   ```
   type: poem                (poem, essay or story)
   title: ചണ്ഡാലഭിക്ഷുകി
   author: എൻ. കുമാരനാശാൻ
   year: 1922
   author_died: 1924         (used to check copyright: in India, works are free 60 years after the author's death)
   source: മലയാളം വിക്കിഗ്രന്ഥശാല
   source_url: https://ml.wikisource.org/wiki/...
   note: (optional) one line shown above the text
   ---
   the text goes here...
   ```

   - Leave a blank line between stanzas or paragraphs.
   - For poems, stanza numbers at the end of a line (after 3 or more spaces) are shown neatly on the right.
3. Open `content/library.json` and add the file name, without `.txt`, to the end of the right list (`poem`, `essay` or `story`).

**How the schedule works.** Day 1 is `launchDate` (currently 18 November 2026; change it to the day your friends start). On day N the site shows item N from each list, and starts again from the top when a list runs out. Always add to the **end** of a list. Reordering a list changes what past days showed.

## Previewing on your computer

Double-clicking `index.html` won't work, because browsers block a page from reading its own files that way. Use one of these instead:

- **VS Code:** install the "Live Server" extension, right-click `index.html`, then choose "Open with Live Server".
- **Python** (already on your computer): open a terminal in this folder and run `python -m http.server 8000`, then go to http://localhost:8000.

## How it's published (GitHub Pages)

The site lives in a GitHub repository and is published with GitHub Pages. Every time something is pushed to the `main` branch, GitHub runs `.github/workflows/deploy.yml`, which:

1. downloads any text listed in `content/manifest.json` that isn't in `content/texts/` yet, from Malayalam Wikisource;
2. checks each one against the fingerprint (SHA-256) recorded when it was proofread, and writes the result to `tools/fetch-report.json`;
3. commits the new text files back into the repository, so the texts live in your repository rather than being linked;
4. publishes the site.

Existing files are never overwritten, so your own corrections to a text are safe. To edit a text, edit its file in `content/texts/` (you can do it on github.com with the pencil icon) and commit; the site updates itself in about a minute.

Other free static hosts (Netlify Drop, Cloudflare Pages) also work. Just upload the folder once the texts are in it.

## How the tracker works

Reader progress lives only in the reader's browser (localStorage), so there are no accounts.

- A day counts toward the streak only when all three readings are ticked.
- An unfinished today never breaks the streak.
- One missed day per 7 days is forgiven as a rest day.
- "Stop counting" keeps all the ticks.
- "Backup / Restore" lets a reader move their progress to another phone or browser by copy-pasting a code.

## Where the current texts come from

All 90 texts (30 days) are public domain and come from Malayalam Wikisource (ml.wikisource.org). Days 1–7 were copied and checked by hand; days 8–30 are downloaded by the workflow and checked against fingerprints. Each file links back to its source page. See `SOURCES.md` for the full list, the copyright rule used, and which other sources (Internet Archive, Grantha Pura, Sayahna) are worth using for future batches. `CATALOGUE.md` is the reading shortlist: acclaimed and award-winning works, with what each one needs (public domain, a Creative Commons licence, or permission).
