---
id: TIME-002
name: 一段工作的持续范围
form: 一段工作的持续范围
archetype: timeline
shape: time-span
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 表示一段工作的持续范围
minimumInput: 段名称、开始与结束位置、可选说明
status: 仅规范·模型绘制
standard: materials/TIME-002.md
sources: [archive/表达规范/TIME-002.md]
sheets: []
---

# TIME-002 时间段

## 数据形状与分级

时间区间，数据形状是「time-span」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

每行一个时间段，长度表示持续。可以并行也可以串行，取决于数据。

不能这样用。不要用它表达单个时点；不要用长度暗示数量。

## 绘制

横轴为时间或顺序，条带按行排布，条内写名称，右侧可写说明。

## 可调整

方向、行距、说明。

## 不适用规则

无起止的步骤不适用。

## 验收

起止顺序正确；条带不重叠；标签不越界。
