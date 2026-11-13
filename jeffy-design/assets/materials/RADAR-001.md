---
id: RADAR-001
name: 雷达图
form: 多维轮廓
archetype: compare
shape: radar
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 比较对象的多维评分轮廓
minimumInput: 至少三个同方向、可解释且可比的维度评分；需明确标准化口径
status: 仅规范·模型绘制
standard: materials/RADAR-001.md
sources: []
sheets: []
---

# RADAR-001 雷达图

## 数据形状与分级

多维比较，数据形状是「radar」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

每个对象一条闭合折线，各轴是维度。读者比较的是形状，不是精确值。

不能这样用。不要在不同量纲未标准化时比较；不要用它排名。

## 绘制

各轴从中心向外，刻度标在一条轴上。轴数不超过八个，超过改用表格。

## 可调整

轴数、标准化口径、是否标刻度。

## 不适用规则

维度方向不一致时不适用。

## 验收

轴数与维度一致；归一化口径写明；两条线可以分辨。
