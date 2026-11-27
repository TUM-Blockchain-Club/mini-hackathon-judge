"""Expand regular files in the offline preparation sandbox into its export mount."""
import json
from pathlib import Path
import shutil
import sys
import zipfile

root = Path('/export/submission')
root.mkdir()
filename = sys.argv[1]
if filename in ('', '.', '..') or Path(filename).name != filename:
    raise ValueError('Invalid artifact name')
source = Path('/input/artifact')
if filename.lower().endswith('.zip'):
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 2500 or sum(i.file_size for i in infos) > 96 * 1024**2:
            raise ValueError('Archive exceeds the submission limits')
        for entry in infos:
            dest = (root / entry.filename).resolve()
            if not dest.is_relative_to(root) or dest == root:
                raise ValueError('Invalid archive path')
            if entry.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as src, dest.open('xb') as out:
                    shutil.copyfileobj(src, out)
else:
    shutil.copyfile(source, root / filename)
reference = Path('/export/reference')
reference.mkdir()
if Path('/input/tax.json').exists():
    ref = reference / 'taxtool-sample'
    ref.mkdir()
    for name, data in json.loads(Path('/input/tax.json').read_text())['files'].items():
        (ref / name).write_text(data)
for p in sorted(root.rglob('*')):
    if p.is_file():
        print(p.relative_to(root), p.stat().st_size)
