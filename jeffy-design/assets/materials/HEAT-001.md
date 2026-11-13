---
id: HEAT-001
name: 两类维度交叉后的数值
form: 两类维度交叉后的数值
archetype: table
shape: heatmap
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 比较两类维度交叉后的数值
minimumInput: 行列标签与对应数值矩阵，缺失 null
status: 仅规范·模型绘制
standard: materials/HEAT-001.md
sources: []
sheets: []
---

# HEAT-001 热力矩阵

## 数据形状与分级

交叉比较，数据形状是「heatmap」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

行列各一类维度，单元格是数值。颜色深浅表示大小，必须给出色阶与范围。

不能这样用。不要在量纲不一致的列之间比较颜色；缺失不能当零。

## 绘制

单元格填色按值归一，单元格内写数值或留空，行列标签在侧边。缺失格留白。

## 可调整

色阶方向、是否写数值。

## 不适用规则

需要精确读数时改用表格。

## 验收

缺失与零区分；色阶方向说明写在图注；行列数一致。
