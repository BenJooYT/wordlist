# Hungarian vocab trainer (Magyar → English)

Static site — flashcards + sprint (20 words in 5:00, HU shown, type EN). No build, no deps. Works as GitHub Pages from `main` / root.

## Run locally
Open `index.html` in any browser, or: `python3 -m http.server` in this folder.

## Publish as GitHub Pages
1. `git init && git add -A && git commit -m "vocab trainer v1" && gh repo create hungarian-vocab --public --source=. --push`
2. Repo → Settings → Pages → Deploy from branch → `main` / `(root)` → Save.
3. Site appears at `https://<you>.github.io/hungarian-vocab/`.

## Add your wordlist units
Edit `units.js` — copy the template at the bottom:
```js
{ id: "unit3", title: "Unit 3 — <topic>", subtitle: "", words: [{ hu: "…", en: ["…"] }] },
```
`en` accepts alternatives: `["hi", "hello"]`. Typing check is case-insensitive, `to ` prefix optional.

Send the photo wordlist and I'll transcribe it into units.
