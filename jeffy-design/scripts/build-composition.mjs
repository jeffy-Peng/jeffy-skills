// 页面组装命令行入口；核心逻辑在 lib/composition/build.mjs。
import { buildComposition } from '../lib/composition/build.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('用法 node scripts/build-composition.mjs input.json output.html');
buildComposition(input, output);
console.log(output);
