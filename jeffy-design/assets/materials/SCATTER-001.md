---
id: SCATTER-001
name: 散点图
form: 相关与分布
archetype: relation
shape: scatter
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 观察两项数值的关联与分布
minimumInput: 对象名称与 X、Y 两项有限数值
status: 仅规范·模型绘制
standard: materials/SCATTER-001.md
sources: []
sheets: []
---

# SCATTER-001 散点图

## 数据形状与分级

数值关系，数据形状是「scatter」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

每个点是一个对象，横纵轴各一项数值。读者看的是整体形状、聚集与离群，不是逐个读数。

不能这样用。不要用它表达时间顺序；不要在没有关系的两项数据上暗示相关。

## 绘制

两轴都从数据范围取，必要时从零起。点半径为固定值，重叠密集时降低不透明度。可标注少量重点点。

## 可调整

轴范围、点大小、重点标注。

## 不适用规则

类别型数据不适用；样本少于五个时说明点少。

## 验收

点数与数据一致；轴刻度可读；重点标注不重叠。
