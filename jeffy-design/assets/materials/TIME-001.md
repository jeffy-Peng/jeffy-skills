---
id: TIME-001
name: 时间线
form: 事件先后
archetype: timeline
shape: timeline
tier: primary
options: [direction, spacing, details, focus]
defaults: {direction: vertical, spacing: equal, details: true}
question: 说明事件先后或时间位置
minimumInput: 事件名称、日期或顺序
status: 已入库·自动组装
standard: materials/TIME-001.md
sources: []
sheets: []
---

# TIME-001 时间线

数据形状是「带时间的事件序列」。分级主力，用于说明先后与阶段。

## 语义

每个事件有名称、时间与可选说明。等距模式只表达先后，真实时间模式按时间比例落点，两者含义不同，不能混用而不说明。

不能这样用。不要用它表达数量的多少，那需要柱或折线。不要在没有日期时声称时间比例。

## 绘制

竖向时时间轴在左侧，横向时在上方。节点按模式落点，日期写在轴侧，事件名写在另一侧。说明可开可关。

## 可调整

方向、等距或真实时间、是否显示说明、重点事件。

## 不适用规则

无时间含义的步骤不适用，那应该是流程图。事件超过内容区容量时报错，建议合并阶段。

## 验收

节点数与事件数一致；日期顺序与轴方向一致；说明不与节点重叠；单位不在时间轴上出现。
