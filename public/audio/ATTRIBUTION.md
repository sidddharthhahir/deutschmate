# Pronunciation recordings

The `.ogg` files in `words/` were downloaded from
[Wikimedia Commons](https://commons.wikimedia.org) by `scripts/fetch-audio.mts`.

They are German Wiktionary pronunciation recordings, published under free
licences — most under **CC-BY-SA**, some **CC-BY**, some **CC0** — by individual
volunteer speakers.

Each file keeps the Commons filename stem (`De-<Lemma>.ogg` → `<lemma>.ogg`), so
the original page, speaker and exact licence for any recording can be found at:

```
https://commons.wikimedia.org/wiki/File:De-<Lemma>.ogg
```

To re-fetch them, set `WIKIMEDIA_CONTACT` in `.env.local` to a real URL or email
and run `npm run audio`. Wikimedia's robot policy requires a User-Agent naming
the tool and a genuine contact — a placeholder address is rejected with a 403.

If you redistribute this repository, these files come with the share-alike and
attribution obligations of their individual licences. The app itself never
re-hosts them anywhere; they are served from your own machine.
