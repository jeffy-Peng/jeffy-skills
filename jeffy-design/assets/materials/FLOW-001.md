---
id: FLOW-001
name: 流程图
form: 有向步骤
archetype: flow
shape: process
tier: primary
options: [direction, details, arrows, labels, focus]
defaults: {direction: horizontal, details: true, arrows: true, labels: true}
question: 表达处理步骤、判断与返回
minimumInput: 节点ID、类型、连线；返回边标feedback
status: 已入库·自动组装
standard: materials/FLOW-001.md
sources: []
sheets: []
---

# FLOW-001 流程图

数据形状是「有向步骤图」。分级主力，用于说明处理流程与判断分支。

## 语义

节点类型分开始、处理、判断、结束。边表示先后，返回边必须标 `feedback`。判断节点要有两个及以上出口。

不能这样用。不要用它表达纯时间先后，那需要时间线。不要用它表达组织归属。

## 绘制

按层级从左到右或从上到下排布。判断节点用菱形，开始与结束用圆角。返回边绕到下方走。箭头表示方向，条件文字写在边中点并做遮线。

## 可调整

方向、是否显示说明、箭头、条件文字、重点节点。

## 不适用规则

无步骤的并列关系不适用。循环未标返回边时报错。

## 验收

每个边两端存在；判断节点至少两个出口；返回边不穿过节点；条件文字不重叠。
