---
id: MATRIX-001
name: 四象限矩阵
form: 二维定位
archetype: relation
shape: quadrant
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 在两个维度上定位对象
minimumInput: 对象坐标、维度名称、分界依据
status: 仅规范·模型绘制
standard: materials/MATRIX-001.md
sources: []
sheets: []
---

# MATRIX-001 四象限矩阵

## 数据形状与分级

二维定位，数据形状是「quadrant」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

横纵各一个维度，对象落在一个点上。象限分界必须有依据，写清阈值来自哪里。

不能这样用。不要在没有分界依据时画四象限；不要用它表达精确排名。

## 绘制

中轴线标出分界值，象限可加浅底。对象标签贴近点，重叠时错开。

## 可调整

分界值、象限底色、标签位置。

## 不适用规则

单维度比较不适用。

## 验收

每个对象都有横纵值；分界值有出处；标签不互相遮挡。
