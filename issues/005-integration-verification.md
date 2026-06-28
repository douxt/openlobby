---
type: HITL
estimate: 0.5d
effort: small
status: backlog
blocked_by: ["004"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
# 纯手动验证 — 5 viewport 手动测试 + 桌面 11 项回归
---

# #005 — 集成验证 + 桌面回归

## Parent

`docs/mobile-adaptation-phase-1-prd.md`

## 背景

#001-#004 完成后，系统性验证 Phase 1 完整性。纯验证，不写代码。

## What to build

### 1. 构建 + 测试
```bash
pnpm -r build  # 全包构建 0 错误
pnpm test      # 全测试通过, 重复 3 次
```

### 2. 桌面回归 (1920×1080)
Sidebar 280px, session CRUD, Lobby Manager, 主题/语言切换, Discover/Agents/Channels/Settings/Update 全对话框, Plan Mode, 文件上传, 无 MobileNav/hamburger

### 3. 移动端 5 viewport
| V | 尺寸 | 设备 |
|---|------|------|
| V1 | 320×568 | iPhone SE 1st |
| V2 | 375×667 | iPhone SE 3rd |
| V3 | 390×844 | iPhone 12-14 |
| V4 | 430×932 | iPhone 14 Pro Max |
| V5 | 768×1024 | iPad Mini |

每 viewport 检查：hamburger/drawer/MobileNav/dialog/TerminalView/安全区/scroll lock

### 4. 横屏 + 断点穿越
568×320 无 crash, 缩放穿越 768px drawer 自动关

### 5. 无障碍
ARIA 属性, reduced-motion 生效

## Acceptance Criteria

- [ ] AC1: pnpm -r build 全包 0 error
- [ ] AC2: pnpm test 全绿(3次)
- [ ] AC3: 桌面 11 项功能正常
- [ ] AC4: 5 viewport 各 10 项检查通过
- [ ] AC5: 横屏无 crash + 断点穿越 drawer 自动关
- [ ] AC6: ARIA + reduced-motion 正常
- [ ] AC7: 任何问题 → 输出清单, 不标 done
- [ ] AC8: 全通过 → 标 done

## 前置准备

- [x] #001-#004 完成
- [ ] dev server 可启动

## Scope

**In:** build+test+5 viewport+桌面回归+横屏+无障碍
**Out:** 新功能, Phase 2/3

## 风险

- 手动覆盖不全 — 至少覆盖 375/390px 主流宽度
- 回退: 不通过不 merge

## Issue 质量自检

- [x] 1. ≤1d (0.5d)
- [x] 2. HITL (手动验证)
- [x] 3. AC 可观测(8条)
- [x] 4. 无代码变更(N/A)
- [x] 5. 前置准备完整
- [x] 6. 手动验证清单
- [x] 7. N/A
- [x] 8. 可观测
- [x] 9. blocked_by: [004]
- [x] 10. 验证 issue(N/A)
- [x] 11. 全栈覆盖
- [x] 12. Scope 清晰
- [x] 13. 全部 false
- [x] 14. 纯手动(N/A)
