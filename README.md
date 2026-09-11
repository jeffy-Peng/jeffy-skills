# jeffy-skills

我的个人 Skill 仓库。

## Skills

| Skill | 用途 | 安装 |
|---|---|---|
| [3d-deep-research](./3d-deep-research/) | 用可追溯证据链完成深度研究和报告交付 | `npx skills add jeffy-Peng/jeffy-skills --skill 3d-deep-research` |
| [workplace-message-writer](./workplace-message-writer/) | 起草或润色自然、直接、行动导向的职场消息和邮件 | `npx skills add jeffy-Peng/jeffy-skills --skill workplace-message-writer` |
| [read-the-room](./read-the-room/) | 判断交流对象怎么想、真实需求是什么，给出该说什么和不该说什么 | `npx skills add jeffy-Peng/jeffy-skills --skill read-the-room` |

如需全局安装，在命令末尾加 `-g`。

## read-the-room：人际判断与对话决策

`read-the-room` 面向商务、销售，以及任何需要为了推进一件事去读懂对方的人。它不产出"对方是什么类型的人"这类静态标签，而是给出**眼下这一局的判断 + 可执行动作 + 可以直接说出口的话**。

它有三个承重设计：

- **证据阶梯**：把原话和可观察行为（L1/L2）与用户的感受和推测（L3/L4）分开，后者不支撑任何行动建议。用户带着结论来的时候，这一步通常就是全部价值所在。
- **三环定位**：卡在哪，只问三件事——他**想要什么**、他**能不能定**、他**怕什么**。卡点是最低的那一环，用排除法确认。
- **弃权规则**：信息不足时不硬给结论，只给一个探针问题，并说明这个答案会怎样改变判断。

输入常常是残缺的：聊天记录、录音逐字稿、或者只有用户自己的模糊记忆。它按来源分别处理，并对材料充分度作出对应的输出——材料只有三句话时，交付就只有几句话。

档案是可选的：日常单次咨询不落盘；要跟多轮时才建立对象档案，复杂度随接触次数生长。`DESIGN.md` 记录了完整的设计取舍，包括尚未验证的部分。

**与 `workplace-message-writer` 的边界**：`read-the-room` 管"他为什么这么说、我下一步该做什么"；已经知道要说什么、只需要把话写好时用 `workplace-message-writer`。两者会自然衔接——判断完之后，文本可以交给它来写。
