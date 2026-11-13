// 素材文件的 front matter 解析。只支持这个文件格式用得到的写法：
// key: value、key: [a, b]、key: {a: 1}、以及 - 开头的对象列表。
export function parseFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const lines = match[1].split('\n');
  const data = {};
  let currentKey = null;
  let currentItem = null;

  const coerce = (v) => {
    const value = v.trim().replace(/^["']|["']$/g, '');
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
  };
  const pair = (entry) => {
    const [k, ...rest] = entry.split(':');
    return [k.trim(), coerce(rest.join(':'))];
  };
  const scalar = (raw) => {
    const value = raw.trim();
    if (!value) return '';
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((part) => (part.includes(':') ? Object.fromEntries([pair(part)]) : coerce(part)));
    }
    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1).trim();
      if (!inner) return {};
      return Object.fromEntries(inner.split(',').map(pair));
    }
    return coerce(value);
  };

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;

    if (/^\s*-\s+/.test(line)) {
      const content = line.replace(/^\s*-\s+/, '');
      if (!Array.isArray(data[currentKey])) continue;
      const kv = /^([\w-]+):\s*(.*)$/.exec(content);
      if (kv) {
        currentItem = { [kv[1]]: scalar(kv[2]) };
        data[currentKey].push(currentItem);
      } else {
        currentItem = null;
        data[currentKey].push(scalar(content));
      }
      continue;
    }

    const kv = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const [, key, rawValue] = kv;

    if (indent > 0 && currentItem && data[currentKey] === undefined) {
      currentItem[key] = scalar(rawValue);
      continue;
    }
    if (indent > 0 && currentItem) {
      currentItem[key] = scalar(rawValue);
      continue;
    }
    if (rawValue === '') {
      data[key] = [];
      currentKey = key;
      currentItem = null;
    } else {
      data[key] = scalar(rawValue);
      currentKey = null;
      currentItem = null;
    }
  }
  return { data, body: text.slice(match[0].length) };
}
