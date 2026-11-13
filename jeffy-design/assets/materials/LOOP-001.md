---
id: LOOP-001
name: 循环顺序与方向
form: 循环顺序与方向
archetype: relation
shape: loop
tier: backup
implementation: model
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 表达循环顺序与方向
minimumInput: 至少两个环节及有意义的有向反馈关系
status: 仅规范·模型绘制
standard: materials/LOOP-001.md
sources: []
sheets: []
---

# LOOP-001 循环图

## 数据形状与分级

循环关系，数据形状是「loop」。分级后备，需要时按本规范由模型绘制，不进像素基线。

## 语义

若干环节首尾相接，强调回到起点。每个箭头都要有业务含义。

不能这样用。不要用它表达一次性流程；不要在没有反馈的地方画回环。

## 绘制

环节沿圆周排布，箭头顺时针或按顺序连接，说明写在弧外。

## 可调整

方向、是否标说明。

## 不适用规则

单向流程不适用。

## 验收

首尾相接；箭头方向与顺序一致；说明不与线重叠。
