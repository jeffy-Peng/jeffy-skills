"""子集化并保留原始纵向度量。

pyftsubset 会按保留下来的字形重算 hhea / OS/2 的升降部，16px 的行高会变成 18px，
本来正好放下的标签就压出边界。这里把源字体的一整套纵向度量搬回子集文件。
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

METRICS = [
    ('hhea', ['ascent', 'descent', 'lineGap']),
    ('OS/2', ['usWinAscent', 'usWinDescent', 'sTypoAscender', 'sTypoDescender', 'sTypoLineGap']),
]


def main(source, text_file, output):
    subset.main([
        source,
        f'--text-file={text_file}',
        '--flavor=woff2',
        '--layout-features=*',
        '--name-IDs=*',
        '--notdef-outline',
        f'--output-file={output}',
    ])
    original = TTFont(source)
    result = TTFont(output)
    for table, fields in METRICS:
        if table not in original or table not in result:
            continue
        for field in fields:
            if hasattr(original[table], field) and hasattr(result[table], field):
                setattr(result[table], field, getattr(original[table], field))
    result.flavor = 'woff2'
    result.save(output)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('用法 subset-font.py 源字体 字符文件 输出.woff2')
    main(*sys.argv[1:])
