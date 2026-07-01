---
pr: ["https://github.com/douxt/openlobby/pull/31"]
type: AFK
estimate: 0.5d
effort: small
status: done
blocked_by: []
needs_llm: true
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: ["tests/test_mock.py"]
---
pr: ["https://github.com/douxt/openlobby/pull/31"]

# TEST-T1: 全流程冒烟测试

## 背景
验证 dispatch → Archon 7 节点 → done 全流程。

## Acceptance Criteria
- [ ] AC1: dispatch 成功抢占
- [ ] AC2: Archon 实现节点正常
- [ ] AC3: PR 创建 + 合并
- [ ] AC4: issue status → done
