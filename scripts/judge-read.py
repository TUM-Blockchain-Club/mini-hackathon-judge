#!/usr/bin/python3
"""Read a submission artifact inside the event sandbox."""
import pathlib
import subprocess
import sys
import itertools

p = pathlib.Path(sys.argv[1])
if not p.is_file() or p.stat().st_size > 40 * 1024 * 1024:
    sys.exit("Missing file or file exceeds 40 MiB")
suffix = p.suffix.lower()
if suffix == ".xlsx":
    import openpyxl
    book = openpyxl.load_workbook(p, read_only=True, data_only=True)
    for sheet in book:
        print("SHEET", sheet.title)
        for row in itertools.islice(sheet.iter_rows(), 180):
            print(" ".join(f"{c.coordinate}={str(c.value)[:250]}" for c in row[:60] if c.value is not None))
elif suffix == ".docx":
    import docx
    d = docx.Document(p)
    for paragraph in d.paragraphs:
        print(paragraph.text)
    for table in d.tables:
        for row in table.rows:
            print([c.text for c in row.cells])
elif suffix == ".pdf":
    subprocess.run(["pdftotext", "-layout", str(p.resolve()), "-"], check=True)
elif suffix in (".png", ".jpg", ".jpeg", ".webp"):
    subprocess.run(["tesseract", str(p.resolve()), "stdout"], check=True)
else:
    with p.open(errors="replace") as stream:
        print(stream.read(16000))
