# XYZ 全景图

适用于有可核实转折、全景能解释因素如何影响研究主体的报告。点三次依次展开全部 X、Y、Z，每步保留前面的层。全部展开后可旋转、放大和点选节点。位置只表示结构，影响待验证时用虚线和文字标明。

## 数据约定

研究问题和资料截止日沿用报告。按证据确定的时间顺序填写 xs。因素属于某一个转折。同名因素在不同转折有各自的编号。每条影响显式指向同一转折下的一项或多项因素。一个因素可以关联多个影响，联合影响填写实际参与的因素。

```json
{
  "xs": [
    {"id":"X1","time":"2026.05","title":"早餐提前营业","detail":"由八点改为七点","cites":["S01"]}
  ],
  "factors": [
    {"id":"Y1","x":"X1","name":"通勤提前","kind":"推动","detail":"提前经过门店的通勤客增多","cites":["S01"]}
  ],
  "impacts": [
    {"id":"Z1","x":"X1","factors":["Y1"],"claim":"C01","path":["增加早段到店机会","早餐订单增加"],"condition":"适用于通勤客较多的工作日","cites":["S01"],"pending":false}
  ]
}
```

- 节点编号全图唯一，由字母开头，可含数字、连字符和下划线。
- Y 的 kind 填推动、制约或待查。待查可以没有来源，但应在 detail 写明证据缺口。
- Z 填作用路径和成立条件。结果及证据边界直接取自 A2，来源必须登记在 A1 并支持该条 A2。证据不足时填 pending 为 true，并标明待验证的环节。没有可用 A2 判断时填 claim 为 null，此时来源可为空。
- 无法建立有意义的 X 或 Y 到 Z 路径时，沿主流程交付报告。已量化结果在正文或适用的数据图中标明口径、单位和来源。

## 构建和联合验收

```bash
python [skill目录]/scripts/build_report.py report.md --xyz xyz.json
python [skill目录]/scripts/build_panorama.py xyz.json --report report.md
python [skill目录]/scripts/build_panorama.py xyz.json --report report.md --check
```

输出目录不同于源稿目录时，给报告构建传 --output-dir，并给全景构建及验收传 -o <输出目录>/panorama.html。报告与图相互链接，图上的来源和判断编号可到 A1、A2。改动证据或判断后，同步审阅正文与 XYZ 路径，再重建并联合验收。联合验收核对产物、数据、账本和版本，事实与因果归因仍按证据协议回源。

离线核对三步累计展开、每条 Z 的因素和结果、节点跳转与窄屏。关闭 JavaScript 或打印时检查完整的文字路径和证据。
