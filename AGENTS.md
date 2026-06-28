# AGENTS.md — openlobby

## 本 Agent 身份
- 角色: Agent B
- 项目: openlobby
- 全限定名: openlobby/agent-b
- 能力: gate 流程、功能代码（src/ 内）、需求→PRD→Issue、问题发现
- 壁垒: 无 shell、无部署权限、无合并权限 → 遇阻写 _handoff/outbox/agent-b/

## 项目壁垒（不可修改，见 CLAUDE.md 完整列表）
- 禁止修改：.devflow/、CI/CD 配置、Dockerfile、系统配置
- 禁止操作：systemctl、docker、合并 master
- 代码只能写在 ai/ 分支，合并由 dev-machine/agent-a 完成

## 协作通道
- 写委托: _handoff/outbox/agent-b/
- 读回复: _handoff/inbox/agent-b/
- 消息模板: _handoff/TEMPLATE.md
