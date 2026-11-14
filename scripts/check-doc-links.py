#!/usr/bin/env python3
"""Check relative Markdown links without requiring third-party tooling."""
from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
readme = root / "README.md"
text = readme.read_text(encoding="utf-8")
links = re.findall(r"\[[^]]+\]\(([^)]+)\)", text)
missing = []
for link in links:
    link = link.split("#", 1)[0].strip().strip("<>")
    if not link or "://" in link or link.startswith("mailto:"):
        continue
    if not (root / link).exists():
        missing.append(link)
if missing:
    print("Missing relative README links:")
    print("\n".join(f"- {link}" for link in missing))
    sys.exit(1)
print(f"Checked {len(links)} README links")
