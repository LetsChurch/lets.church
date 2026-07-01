# STEPBible Tagged Bible data (Greek NT + Hebrew OT)

These files are the **Translators Amalgamated Greek New Testament (TAGNT)** and
**Translators Amalgamated Hebrew Old Testament (TAHOT)** from STEPBible. They
provide the original-language, morphologically-tagged words that power the
"Original" interlinear view (see `src/db/seed-source.ts`).

## Source

- Project: **STEPBible** — <https://www.STEPBible.org>
- Repository: <https://github.com/STEPBible/STEPBible-Data> (directory
  `Translators Amalgamated OT+NT/`)
- Data created by www.STEPBible.org based on work at **Tyndale House, Cambridge**.

## License

**Creative Commons Attribution 4.0 International (CC BY 4.0)** —
<https://creativecommons.org/licenses/by/4.0/>

The license permits including and redistributing this data (including within
software) provided attribution is given. This copy is redistributed here under
those terms; the canonical, up-to-date source remains
<https://github.com/STEPBible/STEPBible-Data> — please refer corrections and
updates there.

## Changes made

The data itself is **unchanged**. The only modification is packaging: each
upstream `.txt` file is stored here **gzip-compressed** (`*.txt.gz`) to keep the
repository and container image small. The seed reads and decompresses them at
build/seed time. The upstream filename each file corresponds to:

| File here | Upstream file |
|---|---|
| `tagnt-mat-jhn.txt.gz` | `TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt` |
| `tagnt-act-rev.txt.gz` | `TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt` |
| `tahot-gen-deu.txt.gz` | `TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt` |
| `tahot-jos-est.txt.gz` | `TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt` |
| `tahot-job-sng.txt.gz` | `TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt` |
| `tahot-isa-mal.txt.gz` | `TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt` |

Each file also retains STEPBible's own header (attribution + license + column
legend) inside it.
