# AFK 管线全面审计报告

> 审计日期: 2026-06-29
> 审计对象: OpenLobby AFK 自主编码管线（10 文件、~900 行）
> 审计方法: 5 维度并行独立审查（安全、正确性、架构、可靠性、流程）
> 参考标准: OWASP Top 10、Google SRE、12-Factor App、Comfy 4-lab Review、TriAdReview

---

## 总览

| 维度 | 得分 | Critical | High | Medium | Low |
|:--|:--:|:--:|:--:|:--:|:--:|
| ✅ 正确性 | **2/10** | 1 | 3 | 3 | 3 |
| 🔒 安全性 | **3/10** | 2 | 2 | 3 | 3 |
| 🔄 流程完整性 | **3/10** | 1 | 4 | 5 | 4 |
| 🏗️ 架构设计 | **4/10** | 3 | 5 | 4 | 2 |
| 🛡️ 可靠性 | **4/10** | 3 | 5 | 4 | 2 |
| **综合** | **3.2/10** | **10** | **19** | **19** | **14** |

**结论**: 管线不适合生产环境。核心功能链路能跑（扫描→实现→审查→PR），但安全有注入点、正确性有死循环、可靠性无监控、流程无闭环。

---

## 🔴 Critical（10 项 — 必须立即修复）

### COR-01: 孤儿检测正则无法匹配 Archon 分支名
- **维度**: 正确性
- **文件**: `reconciler.sh:55`
- **描述**: `grep -qE "(ai|archon)/.*${ISSUE_NUM}"` 无法匹配 Archon 分支名 `archon/task-auto-execute-afk-<timestamp>`（不含 issue 编号）。所有 Archon 处理的 issue 被判孤儿 → 回收 ready → dispatch 再次认领 → 死循环。已生产验证：issue #001 被 2 次 dispatch，#004 进入死循环。
- **修复**: Archon 分支名加入 issue 编号，或 reconciler 改为基于 worktree 映射文件检测。
- **参考**: 实测日志 dispatch.log + reconcile.log

### SEC-01: 真实 API Key 在组可读文件中泄露
- **维度**: 安全性
- **文件**: `/etc/devflow/openlobby.env`
- **描述**: 真实 Anthropic/DeepSeek API key `sk-5acd0457d9f84678ac499ec4720dcda0` 存储在 640 权限文件，www 组（GID 1001）内任何进程可读。key 已通过此报告泄露，必须立即轮换。
- **修复**: `chmod 600`，轮换 key，审计 www 组成员。
- **参考**: CWE-522, OWASP A05:2021

### SEC-02: dispatch.sh Python 代码注入
- **维度**: 安全性
- **文件**: `dispatch.sh:173-177`
- **描述**: `python3 -c "payload={'issue':'${ISSUE_SLUG}'...}"` — Shell 变量直接插入 Python 代码。issue 文件名可控（`issues/` 目录），攻击者可创建含单引号的文件名执行任意 Python 代码。
- **修复**: 用 `jq` 安全构建 JSON 或通过环境变量传递数据。
- **参考**: CWE-94, OWASP A03:2021

### ARC-01: dispatch/reconcile 无并发控制
- **维度**: 架构
- **文件**: `dispatch.sh` ↔ `reconciler.sh`
- **描述**: 两个脚本独立修改同一 issue 文件，无互斥锁、无协调协议。dispatch 刚标记 in_progress，reconciler 可能同时扫描到并误判孤儿。
- **修复**: 引入中央状态存储（SQLite/Redis）或锁文件机制。至少 reconciler 跳过最近 10 分钟修改过的 issue。
- **参考**: 并发控制 — 互斥锁模式

### ARC-02: merge-reviews 裁判与 auto-review 同模型
- **维度**: 架构
- **文件**: `auto-execute-afk.yaml:97-107`
- **描述**: auto-review（DeepSeek）和 merge-reviews（DeepSeek）是同一模型。裁判和选手是同一方 — DeepSeek 不会质疑自己的审查输出。违反正交审查原则。
- **修复**: merge-reviews 使用独立第三方模型（GLM-5.2 或 Qwen）。
- **参考**: [Parallel Adversarial Review](https://github.com/prime-radiant-inc/parallel-adversarial-review)

### ARC-03: dispatch.sh 严重违反单一职责
- **维度**: 架构
- **文件**: `dispatch.sh` 全文件
- **描述**: 一个脚本承载 7 个不相关职责：Git 同步、Handoff 检测、Issue 扫描、宪法检查、原子抢占、Archon 执行、成本追踪+通知。任何修改需要理解全部 206 行。
- **修复**: 拆分为 poller.sh（扫描+抢占）、runner.sh（执行 Archon）、notifier.sh（通知+成本）。
- **参考**: 单一职责原则（SRP）

### REC-01: dispatch 被 kill 后 issue 卡 6 小时
- **维度**: 可靠性
- **文件**: `dispatch.sh:123-206`
- **描述**: dispatch 完成原子抢占后调用 Archon，此时若被 kill（OOM/SIGHUP/systemd 超时），Archon 子进程变孤儿，issue 卡 in_progress。reconciler 需 6 小时后才回收。
- **修复**: dispatch.sh 注册 trap 在退出时标记 issue 为 failed 并 push。reconciler 增加基于进程检测的快速回收（1h 而非 6h）。
- **参考**: 已知陷阱 #1

### OBS-02: 无健康检查/探活机制
- **维度**: 可靠性
- **文件**: 全管线
- **描述**: 无 HTTP 健康端点、无 Prometheus 指标、无 watchdog。systemd timer active ≠ dispatch 在运行。管线静默死亡无法发现。
- **修复**: 添加 HTTP 健康检查端点（/health 返回最后执行时间）、systemd WatchdogSec=60、status.sh 增加"上次成功 dispatch 距今"指标。
- **参考**: Google SRE — 监控应回答"系统在正常工作吗？"

### IDM-01: 原子抢占存在 TOCTOU 竞态
- **维度**: 可靠性
- **文件**: `dispatch.sh:102-111`
- **描述**: sed → git add → git commit → git push 不是原子操作。两个 dispatch 进程可能同时 sed 同一 issue，只有 push 先到的获胜。回滚逻辑（第 107 行）可能在另一个进程已成功 claim 后错误回退。
- **修复**: 使用分布式锁（Redis SETNX/etcd）替代 git push 竞态。
- **参考**: TOCTOU 竞态条件

### PRC-04: 审查结果装饰性 — score 不参与决策
- **维度**: 流程
- **文件**: `auto-execute-afk.yaml:97-109`
- **描述**: merge-reviews 输出 score+issues 后直接进入 create-pr，无任何条件判断。score=1 也创建 PR。审查发现问题不修复、不阻塞、不回退。
- **修复**: 增加 resolve-findings 节点。score<7 或 common_issues 非空 → 回退 implement 修复，循环至 score≥7 或 3 次重试后标记需人工介入。
- **参考**: [Comfy 4-lab Review Pipeline](https://blog.comfy.org/p/comfy-internals-how-we-got-four-rival)

---

## 🟠 High（19 项 — 应尽快修复）

### 安全性
- **SEC-03**: `sk-maf-hub-mini-router` 硬编码在版本控制 YAML 中（`auto-execute-afk.yaml:87`）
- **SEC-04**: `eval "$TEST_CMD"` — config.yaml 可控值执行任意命令（`auto-execute-afk.yaml:66`）

### 正确性
- **COR-02**: reconciler.sh 无 `git checkout main`，可在错误分支提交
- **COR-03**: `ANTHROPIC_MODEL=qwen3.7-max[1m]` — ANSI 转义残留，模型名错误
- **COR-04**: git pull/push 静默吞掉所有错误 → issue 状态永久卡死

### 架构
- **ARC-04**: config.yaml 被 4 种不同方式独立解析（grep/awk/YAML/字符串匹配）
- **ARC-05**: git push 竞态抢占存在网络故障和状态不一致风险
- **ARC-06**: Archon 9 节点硬编码，不支持动态配置/跳过
- **ARC-07**: grep/awk 解析 YAML 极其脆弱，格式变化静默失效
- **ARC-08**: ANTHROPIC_BASE_URL 等环境变量隐式依赖，无文档

### 可靠性
- **RET-01**: 重试固定 10s 间隔，无指数退避
- **RET-02**: 重试整个 workflow 而非从失败节点继续
- **RET-03**: 缺断路器 — 连续失败应全局退避而非逐个失败+通知
- **IDM-02**: git stash 模式不幂等，已观测 30+ stash 堆积
- **OBS-01**: 日志无结构化格式，无法机器解析

### 流程
- **PRC-01**: 裁判与 auto-review 同模型（同 ARC-02）
- **PRC-07**: HITL issue 被静默跳过，无通知人处理
- **PRC-14**: 人机交互只有单向通知，无接收审批回复路径
- **PRC-05**: merge-reviews 无矛盾处理规则（一个 CLEAN 一个 3 HIGH 怎么判）

---

## 🟡 Medium（19 项 — 计划修复）

### 安全性
- **SEC-05**: `/tmp/cross-review-output.txt` 固定路径 — symlink 竞态
- **SEC-06**: `$BLOCKED_BY` 未引号 — glob 扩展风险
- **SEC-07**: 15+ 处 `|| true` 和 `2>/dev/null` 系统性压制错误

### 正确性
- **COR-06**: dispatch 和 reconcile 之间存在竞态窗口（Archon 分支未创建时）
- **COR-07**: 两脚本 blocked_by 解析正则不同（grep -oP vs sed POSIX）
- **COR-08**: in_progress→in_review 转换 push 失败后状态永久卡死

### 架构
- **ARC-09**: check_constitution.py 检查逻辑与输出格式化混合
- **ARC-10**: setup 节点属于基础设施职责，不应在 Archon 工作流中
- **ARC-11**: config.yaml 核心值用占位符，新项目部署出错风险高
- **ARC-12**: Handoff 检测是独立功能，植入 dispatch.sh 破坏关注点分离

### 可靠性
- **OBS-03**: status.sh 仪表盘缺失关键运维指标（当前执行 issue、成功率、worktree 数）
- **OBS-04**: 成本估算硬编码 20000+5000 token，非实际计数
- **REC-04**: config.yaml 缺失时管线拒绝启动且无降级
- **REC-05**: 主日志被 Archon 原始输出污染，无日志轮转
- **DEG-03**: 宪法检查失败时错误信息不可操作

### 流程
- **PRC-02**: cross-review 无公网 fallback（依赖 localhost:3457）
- **PRC-11**: Issue parent 指向 PRD 但 Archon 工作流未读取 PRD
- **PRC-16**: www 用户在 Agent 防护体系中角色不清晰
- **PRC-17**: 无代码来源验证（恶意代码 push 到 main 可被执行）
- **PRC-18**: _handoff/ 通信死锁未解决（Agent B 不能 push handoff）

---

## 🟢 Low（14 项 — 改善建议）

### 安全性
- **SEC-08**: trap 在 mktemp 之后设置，存在泄露窗口
- **SEC-09**: 错误处理器使用相对日志路径 vs 绝对 `$LOG_FILE`
- **SEC-10**: Telegram bot token 在 URL 路径中传输

### 正确性
- **COR-09**: trap 在 while 循环内重复设置
- **COR-10**: git stash pop 冲突时 stash 累积（30+ 已观测）
- **COR-11**: status.sh blocked_by 循环未引用变量

### 架构
- **ARC-13**: cost_tracker.py 和 notify.py 故障被静默忽略
- **ARC-14**: git stash 守卫是运维补丁而非架构方案

### 可靠性
- **RET-04**: 回收阈值 6h/24h 未按 issue 规模分级
- **RET-05**: worktree cleanup 失败静默，可能堆积
- **OBS-05**: 日志截断 52 字符丢失关键信息
- **DEG-04**: NO_MORE_TASKS exit 0 可能掩盖退化
- **DEG-05**: reconciler git pull 失败静默继续 — 状态不同步

### 流程
- **PRC-03**: 双模型审查 prompt 几乎相同，缺多样性
- **PRC-10**: failed 自动恢复无根因分析
- **PRC-12**: needs_* 字段被宪法检查但未被工作流使用
- **PRC-13**: Gate 4 评审结论未传递到 dispatch
- **PRC-15**: 有 TriAdReview 指出的"简化偏差"风险

---

## 修复优先级路线图

### Phase 0 — 止血（本周）
1. 轮换泄露的 API key（SEC-01）
2. 修复 Python 注入点（SEC-02）
3. 移除硬编码 token（SEC-03）
4. 修复 eval 注入（SEC-04）
5. 停止 reconcile 死循环（COR-01）

### Phase 1 — 能用（2 周）
6. dispatch.sh 加 git checkout main（COR-02）
7. 修复 ANTHROPIC_MODEL 名（COR-03）
8. git 错误不再静默吞掉（COR-04, SEC-07）
9. 添加健康检查端点（OBS-02）
10. 审查结果参与决策（PRC-04）

### Phase 2 — 可靠（4 周）
11. dispatch.sh 拆分（ARC-03）
12. 统一配置加载器（ARC-04）
13. merge-reviews 使用独立模型（ARC-02）
14. 断路器 + 指数退避（RET-03, RET-01）
15. 分布式锁替代 git push 抢占（IDM-01）

### Phase 3 — 成熟（8 周）
16. 结构化日志（OBS-01）
17. 工作流节点可配置（ARC-06）
18. 审查后修复循环（PRC-04 延伸）
19. 人机交互闭环（PRC-14）
20. _handoff_ 死锁解决（PRC-18）

---

## 审计方法说明

5 个独立 Explore agent 并行执行，每个负责一个维度。每个 agent 获得：
- 完整的 10 个管线文件源码
- 行业最佳实践参考标准
- 已知问题清单（06-AFK脚本栈规范.md 的 11 个陷阱）

输出格式统一为结构化 JSON（id/severity/file/title/description/fix/reference）。所有 finding 必须引用具体文件:行号。

合并阶段：去重（如 ARC-02 ≈ PRC-01）、交叉验证、统一严重级别。
