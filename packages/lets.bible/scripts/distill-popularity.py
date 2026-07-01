#!/usr/bin/env python3
"""Distill a Common Crawl verse-popularity dump into seed/popularity.json.

Input  (arg, default ./pop.txt at the repo root): lines of "<count> <BOOK> <ch>:<vs>"
        with UPPERCASE, ordinal-word book names ("FIRST CORINTHIANS", "SONG OF
        SOLOMON"); single-chapter books appear as "<BOOK> <vs>".
Output: packages/lets.bible/seed/popularity.json — { "JHN.3.16": 753286, ... }
        (USFM ref -> appearance count), sorted by count desc.

Drops: non-ASCII garbage, chapter/verse 0, unmappable books, and any verse that
does not exist in ANY translation's versification (public/search/structure.json,
so run `just lets-bible-flex` first if that file is stale). Regenerate with:

    python3 packages/lets.bible/scripts/distill-popularity.py /path/to/pop.txt
"""
import re, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
STRUCT = os.path.join(PKG, "public/search/structure.json")
OUT = os.path.join(PKG, "seed/popularity.json")
POP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PKG, "..", "..", "pop.txt")

USFM = {
    "GENESIS":"GEN","EXODUS":"EXO","LEVITICUS":"LEV","NUMBERS":"NUM","DEUTERONOMY":"DEU",
    "JOSHUA":"JOS","JUDGES":"JDG","RUTH":"RUT","FIRST SAMUEL":"1SA","SECOND SAMUEL":"2SA",
    "FIRST KINGS":"1KI","SECOND KINGS":"2KI","FIRST CHRONICLES":"1CH","SECOND CHRONICLES":"2CH",
    "EZRA":"EZR","NEHEMIAH":"NEH","ESTHER":"EST","JOB":"JOB","PSALMS":"PSA","PSALM":"PSA",
    "PROVERBS":"PRO","ECCLESIASTES":"ECC","SONG OF SOLOMON":"SNG","ISAIAH":"ISA","JEREMIAH":"JER",
    "LAMENTATIONS":"LAM","EZEKIEL":"EZK","DANIEL":"DAN","HOSEA":"HOS","JOEL":"JOL","AMOS":"AMO",
    "OBADIAH":"OBA","JONAH":"JON","MICAH":"MIC","NAHUM":"NAM","HABAKKUK":"HAB","ZEPHANIAH":"ZEP",
    "HAGGAI":"HAG","ZECHARIAH":"ZEC","MALACHI":"MAL","MATTHEW":"MAT","MARK":"MRK","LUKE":"LUK",
    "JOHN":"JHN","ACTS":"ACT","ROMANS":"ROM","FIRST CORINTHIANS":"1CO","SECOND CORINTHIANS":"2CO",
    "GALATIANS":"GAL","EPHESIANS":"EPH","PHILIPPIANS":"PHP","COLOSSIANS":"COL",
    "FIRST THESSALONIANS":"1TH","SECOND THESSALONIANS":"2TH","FIRST TIMOTHY":"1TI","SECOND TIMOTHY":"2TI",
    "TITUS":"TIT","PHILEMON":"PHM","HEBREWS":"HEB","JAMES":"JAS","FIRST PETER":"1PE","SECOND PETER":"2PE",
    "FIRST JOHN":"1JN","SECOND JOHN":"2JN","THIRD JOHN":"3JN","JUDE":"JUD","REVELATION":"REV",
}
ONE_CHAPTER = {"OBA","PHM","2JN","3JN","JUD"}

# Union versification across all translations: usfm -> {chapter: maxVerse}.
exists = {}
for _tid, books in json.load(open(STRUCT)).items():
    for usfm, vpc in books.items():
        d = exists.setdefault(usfm, {})
        for i, mv in enumerate(vpc):
            d[i + 1] = max(d.get(i + 1, 0), mv)

rx = re.compile(r"^(\d+)\s+([A-Z][A-Z ]*?)\s+(\d+)(?::(\d+))?$")
agg = {}
st = {"lines":0,"garbage":0,"malformed":0,"badbook":0,"nonexistent":0,"kept":0}
for raw in open(POP, "rb"):
    st["lines"] += 1
    try: line = raw.decode("ascii").strip()
    except UnicodeDecodeError: st["garbage"] += 1; continue
    if not line: continue
    m = rx.match(line)
    if not m: st["malformed"] += 1; continue
    count, name, a, b = int(m.group(1)), m.group(2).strip(), int(m.group(3)), m.group(4)
    usfm = USFM.get(name)
    if not usfm: st["badbook"] += 1; continue
    if b is None:
        if usfm in ONE_CHAPTER: ch, vs = 1, a
        else: st["malformed"] += 1; continue
    else: ch, vs = a, int(b)
    if ch < 1 or vs < 1: st["malformed"] += 1; continue
    bk = exists.get(usfm)
    if not bk or vs > bk.get(ch, 0):
        st["nonexistent"] += 1; continue
    ref = f"{usfm}.{ch}.{vs}"
    agg[ref] = agg.get(ref, 0) + count
    st["kept"] += 1

ordered = dict(sorted(agg.items(), key=lambda kv: (-kv[1], kv[0])))
with open(OUT, "w") as f:
    json.dump(ordered, f, indent=0)
    f.write("\n")
print("stats:", json.dumps(st))
print(f"wrote {len(ordered)} verses -> {OUT}")
