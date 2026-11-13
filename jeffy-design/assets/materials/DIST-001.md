---
id: DIST-001
name: 直方图
form: 分布形态
archetype: compare
shape: distribution
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 查看原始样本的区间分布
minimumInput: 有限数值的原始样本数组
status: 仅规范·模型绘制
standard: materials/DIST-001.md
sources: []
sheets: []
---

# DIST-001 直方图

## 数据形状与分级

数据分布，数据形状是「distribution」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

把样本按区间分箱，看形状：集中、偏斜、双峰。

不能这样用。不要用它替代趋势；不要用平滑曲线掩盖离散样本。

## 绘制

等宽分箱，柱高为计数；箱宽与箱数在图注写明。

## 可调整

箱数、箱宽。

## 不适用规则

样本少于十个时说明样本量。

## 验收

箱数与区间一致；计数与样本总数一致。
