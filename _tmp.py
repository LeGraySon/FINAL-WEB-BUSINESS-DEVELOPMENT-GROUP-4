from pathlib import Path
text=Path('top-detail.html').read_text(encoding='utf-8')
for i,line in enumerate(text.splitlines(),1):
    if 360 <= i <= 420:
        print(f'{i:04d}: {line}')
