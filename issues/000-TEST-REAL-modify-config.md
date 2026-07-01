---
type: AFK
estimate: 0.5d
effort: small
status: done
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: ["tests/test_real_code_change.py"]
pr: ["https://github.com/douxt/openlobby/pull/32"]
---

# TEST: 修改 .devflow/config.yaml name 字段

## Acceptance Criteria
- [ ] AC1: name 值改为 TEST-WORKTREE
- [ ] AC2: PR 创建并合并成功
- [ ] AC3: issue status → done
