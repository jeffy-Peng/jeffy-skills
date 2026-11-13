"""把字样度量写进 fonts.lock.json，用来在渲染时确认用的是这个字体而不是同名替代。

只看族名能命中分辨不出 Noto Serif SC 和 Noto Serif CJK SC：两者宽度接近，行高却差 2px。
这里记录探针文字在 100px 下的前进宽度与字形上下界，渲染时实测比对。
"""
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'scripts' / 'fonts.lock.json'
PROBE = '订单增长五十个百分点 0123456789 ABC abc'


def metrics(path, probe=PROBE):
    font = TTFont(path, fontNumber=0)
    upem = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    glyf = font.getGlyphSet()
    scale = 100.0 / upem
    advance = 0.0
    top = bottom = None
    for ch in probe:
        name = cmap.get(ord(ch))
        if not name:
            continue
        advance += hmtx[name][0] * scale
        pen = BoundsPen(glyf)
        glyf[name].draw(pen)
        if not pen.bounds:
            continue
        _, y_min, _, y_max = pen.bounds
        top = y_max * scale if top is None else max(top, y_max * scale)
        bottom = y_min * scale if bottom is None else min(bottom, y_min * scale)
    return {
        'probe': probe,
        'advance': round(advance, 2),
        'ascent': round(top or 0, 2),
        'descent': round(bottom or 0, 2),
    }


def main():
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    fonts_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / '.local/share/fonts/jeffy-design'
    for entry in lock['fonts']:
        name = entry.get('metricsFile') or entry['file']
        candidates = [fonts_dir / name, Path('/usr/local/share/fonts/design') / name]
        path = next((p for p in candidates if p.exists()), None)
        if path is None:
            print(f'跳过 {entry["family"]}：找不到 {name}')
            continue
        entry['metrics'] = metrics(path, entry.get('probe') or PROBE)
        print(entry['family'], entry['metrics'])
    LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
