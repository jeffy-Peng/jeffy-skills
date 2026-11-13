---
id: FLOW-002
name: 跨角色交接
form: 跨角色交接
archetype: flow
shape: swimlane
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 解释跨角色交接
minimumInput: 角色、步骤与所属泳道
status: 仅规范·模型绘制
standard: materials/FLOW-002.md
sources: []
sheets: []
---

# FLOW-002 泳道图

## 数据形状与分级

跨角色流程，数据形状是「swimlane」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

每个角色一条泳道，步骤落在所属泳道内，跨泳道的连线表示交接。

不能这样用。不要用它表达没有角色分工的流程；不要让步骤跨两条泳道。

## 绘制

泳道横向或纵向排布，泳道名在首列；步骤顺序从左到右或从上到下。

## 可调整

方向、是否标交接说明。

## 不适用规则

角色超过六个泳道时排布拥挤，建议拆分。

## 验收

每个步骤都在一条泳道内；交接有连线；泳道名唯一。
