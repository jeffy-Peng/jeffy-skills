---
id: DIST-001
name: 直方图
form: 分布形态
archetype: compare
shape: distribution
encoding: length
readingTime: read
cost: small
alternates: [BAR-001]
tier: backup
implementation: engine
options: [direction, sort]
defaults: { direction: vertical, sort: given }
question: 查看原始样本的区间分布
minimumInput: 有限原始样本；调用参考实现前按明确区间预分箱
status: 已入库·自动组装
standard: materials/DIST-001.md
sources: []
sheets: []
---

# DIST-001 直方图

## 数据形状与分级

数据分布，数据形状是「distribution」。分级后备，已接入统一绘制引擎；工具未覆盖的合法结构可按本规范重绘。

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

## 当前参考接口

参考实现接收已分箱的 `data:[{label,values:[频数]}]` 与 `series:["频数"]`，不自动从原始样本分箱。先明确箱宽、区间与边界归属，核对频数合计等于样本数。按区间顺序绘制，不能按频数排序伪装成分布。
