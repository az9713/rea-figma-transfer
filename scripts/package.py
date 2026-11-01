import hashlib
from pathlib import Path
import zipfile

root=Path(__file__).resolve().parents[1]
target=root/'releases/transfer-contract-inspector-0.1.0.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as out:
    for source,name in [('dist/code.js','code.js'),('dist/manifest.json','manifest.json'),('LICENSE','LICENSE'),('README.md','README.md')]:
        info=zipfile.ZipInfo(name,date_time=(2026,11,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        out.writestr(info,(root/source).read_bytes())
(root/'releases/SHA256SUMS.txt').write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+target.name+'\n',encoding='utf-8')
print(target.name, target.stat().st_size)
