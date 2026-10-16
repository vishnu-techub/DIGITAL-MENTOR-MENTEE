# Grammar vocabulary data — sources and licences

This directory holds the two word lists that back the writing assistant's
dictionary-gated spelling and validation layer (`vocabulary/lexicon.ts`). They
are **not** fabricated, generated, or inflated: each file is a verbatim copy of
a public, properly licensed dataset. Nothing in this directory is redacted or
modified.

The engine works without these files (it degrades to the curated rules and logs
a warning), but the broad spelling coverage needs them.

---

## 1. `words_alpha.txt` — the dictionary

- **What it is:** a plain-text list of English words, one per line, lowercase,
  letters only (no hyphenated or possessivised forms). Roughly 370,000 entries,
  counts included in `lexicon.ts` as the runtime `wordCount`.
- **Upstream project:** `dwyl/english-words`
  <https://github.com/dwyl/english-words>
- **Exact path in that project:** `words_alpha.txt`
- **Direct download:** <https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt>
- **Licence:** **The Unlicense** (public domain dedication).
  <https://github.com/dwyl/english-words/blob/master/LICENSE.md>
- **File size:** 4,234,910 bytes
- **SHA-256:** `3ED0C94610D8BCF7C11BBB49C56AA49C7234D32B66824DF91F554169E572DA48`
- **Retrieved:** 2026 (single `raw.githubusercontent.com` GET)
- **How it is used:** loaded once into an in-memory `Set<string>`. It answers
  "is this a real English word?" so the engine never flags or "corrects"
  legitimate vocabulary. It is also the candidate pool for spelling suggestions.

### A note on the Unlicense and the word list

The Unlicense places the work in the public domain. A raw dictionary of common
English words contains no creative expression that could attract copyright, and
the upstream project explicitly dedicates it to the public domain, so it is safe
to ship and redistribute.

The list does include some archaic/obsolete spellings (`untill`, and a handful
of others). A tiny, explicit `NON_WORD_ENTRIES` override in `lexicon.ts` removes
those specific entries at load time (without editing the file on disk) so the
spelling corrector can offer the modern form. See the comment on
`NON_WORD_ENTRIES`.

---

## 2. `en_50k.txt` — the frequency ranking

- **What it is:** the 50,000 most frequent English tokens with corpus counts,
  one `word count` pair per line, used to rank spelling suggestions so only
  genuinely common words are ever offered.
- **Upstream project:** `hermitdave/FrequencyWords`
  <https://github.com/hermitdave/FrequencyWords>
- **Exact path in that project:** `content/2018/en/en_50k.txt`
- **Direct download:** <https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt>
- **Licence:** **MIT License** (the repository ships a `LICENSE` file).
  <https://github.com/hermitdave/FrequencyWords/blob/master/LICENSE>
- **Underlying corpus:** the counts are derived from the OpenSubtitles2018
  corpus. Only aggregate word frequencies are used here — no subtitle text,
  dialogue, or any other creative content is copied, stored, or redistributed.
- **File size:** 622,749 bytes
- **SHA-256:** `5351FF405B1126EF555791DD4D9798A48E3E9A501A9FC481A9DA957752CFB458`
- **Retrieved:** 2026 (single `raw.githubusercontent.com` GET)
- **How it is used:** loaded once into a `Map<string, number>`. A candidate
  spelling is only offered when it appears in the dictionary **and** in this
  ranking; a distance-2 candidate additionally has to be genuinely common
  (count ≥ 5,000).

---

## Why these two and not others

- `first20hours/google-10000-english` was evaluated and **rejected**: its data
  is an unattributed aggregation and the repository carries no clear licence, so
  it cannot be shipped with confidence.
- No list is generated, concatenated or duplicated — the total runtime
  vocabulary is exactly the upstream `words_alpha.txt` size minus the tiny
  `NON_WORD_ENTRIES` overrides, which is reported by `getLexiconStats()`.

## Regenerating / verifying

Re-downloading either file from the direct URLs above must reproduce the
SHA-256 hashes recorded here. The engine records the resolved data directory and
the entry counts at load time (`getLexiconStats()`), and the startup log prints
them.
