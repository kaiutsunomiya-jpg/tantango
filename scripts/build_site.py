#!/usr/bin/env python3
"""Build たんたんご！ for GitHub Pages from all CSVs in Flash/Vocabulary.

Column meanings are positional. Header wording never determines parsing.
2 columns: Japanese / response (or generic prompt / response)
3 columns: original Chinese / pinyin / Japanese
4 columns: vocabulary / meaning / example / example translation
5 columns: same as 4 + highlight substring
"""
from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "dist"
SETS = ROOT / "VocabularySets"
DIRECTORIES = ("Vocabulary", "Flash")
VALID_WIDTHS = {2, 3, 4, 5}


def infer_language(name: str, columns: int, rows: list[list[str]]) -> str:
    if columns == 3:
        return "zh"
    # Prefer file title indicators and the actual language of the foreign-text fields.
    if re.search(r"韓国|韓語|TOPIK|한국|korean", name, re.I):
        return "ko"
    if re.search(r"中国|漢語|HSK|中文|chinese", name, re.I):
        return "zh"
    if re.search(r"英語|英作文|英会話|英検|TOEIC|^1級|english", name, re.I):
        return "en"
    # Ignore Japanese translations when possible, but inspect both prompt/answer for
    # 2-column CSVs as some use English words as the first column.
    sample = " ".join(" ".join(row[:3] if columns > 2 else row) for row in rows[:30])
    if re.search(r"[가-힣]", sample):
        return "ko"
    if re.search(r"[A-Za-z]", sample):
        return "en"
    return "zh" if columns == 3 else "en"


def check_csv(path: Path, folder: str) -> dict:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = [row for row in csv.reader(handle, strict=True) if any(cell.strip() for cell in row)]
    except (UnicodeError, csv.Error) as error:
        raise ValueError(f"{path}: UTF-8 CSVを読み取れません：{error}") from error
    if len(rows) < 2:
        raise ValueError(f"{path}: ヘッダーと1件以上のデータ行が必要です")

    # Header names may vary; the number of actual data columns defines the format.
    lengths = [len(row) for row in rows[1:]]
    columns = max(set(lengths), key=lambda width: (lengths.count(width), width))
    if columns not in VALID_WIDTHS:
        raise ValueError(f"{path}: {columns}列のCSVは非対応です（2/3/4/5列対応）")
    if folder == "Flash" and columns not in (2, 3):
        raise ValueError(f"{path}: Flashには2列または3列のCSVを格納してください")
    if folder == "Vocabulary" and columns not in (3, 4, 5):
        raise ValueError(f"{path}: Vocabularyには3・4・5列のCSVを格納してください")
    for number, row in enumerate(rows[1:], start=2):
        if len(row) != columns and not (columns == 5 and len(row) == 4):
            raise ValueError(f"{path} {number}行目: {len(row)}列です（データ形式は{columns}列）")
        if not row[0].strip():
            raise ValueError(f"{path} {number}行目: 最初の項目が空欄です")
    # Files are placed in a mode's folder. 3-column Chinese sets can live in Flash.
    language = infer_language(path.name, columns, rows[1:])
    mode = "chinese" if columns == 3 else "composition" if columns == 2 else "vocabulary"
    return {
        "name": path.name,
        "path": f"{folder}/{path.name}",
        "folder": folder,
        "mode": mode,
        "columns": columns,
        "language": language,
        "count": len(rows) - 1,
    }


def build() -> None:
    items = []
    for folder in DIRECTORIES:
        directory = SETS / folder
        if not directory.is_dir():
            raise ValueError(f"{directory} がありません")
        items.extend(check_csv(path, folder) for path in sorted(directory.glob("*.csv"), key=lambda path: path.name.casefold()))
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
    for name in ("index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest", ".nojekyll"):
        shutil.copy2(ROOT / name, DEST / name)
    shutil.copytree(ROOT / "icons", DEST / "icons")
    dest_sets = DEST / "VocabularySets"
    dest_sets.mkdir()
    for folder in DIRECTORIES:
        shutil.copytree(SETS / folder, dest_sets / folder)
    (dest_sets / "index.json").write_text(json.dumps({"version": 3, "files": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(items)} セット / {sum(item['count'] for item in items)} 項目")
    for item in items:
        print(f"  [{item['folder']}/{item['language']}/{item['mode']}] {item['name']}: {item['count']}")
    legacy = list(SETS.glob("*.csv"))
    if legacy:
        print("注意: VocabularySets直下のCSVは公開対象外です：" + ", ".join(path.name for path in legacy))


if __name__ == "__main__":
    build()
