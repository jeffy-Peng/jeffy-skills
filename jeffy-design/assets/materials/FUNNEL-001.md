---
id: FUNNEL-001
name: 漏斗图
form: 阶段转化
archetype: flow
shape: funnel
encoding: length
readingTime: fast
cost: medium
alternates: [BAR-001]
tier: backup
implementation: engine
options: [conversion]
defaults: {conversion: true}
question: 说明逐阶段筛选和转化
minimumInput: 同一批对象各阶段非递增数量
status: 已入库·自动组装
standard: materials/FUNNEL-001.md
sources: []
sheets: []
---

# FUNNEL-001 漏斗图

## 数据形状与分级

阶段转化，数据形状是「funnel」。分级后备，已接入统一绘制引擎；工具未覆盖的合法结构可按本规范重绘。

## 语义

每个阶段是同一批对象的一个环节，数量只能递减。转化率写在两阶段之间。

不能这样用。不要用它表达时间顺序的过程；不要用非同一批对象的数据。

## 绘制

自上而下居中排布，宽度按阶段数量比例，阶段间写转化率。

## 可调整

方向、是否标转化率。

## 不适用规则

阶段数超过八个报容量。

## 验收

数量递减；转化率计算正确；宽度比例与数量一致。
