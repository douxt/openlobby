# AI Dev Flow Server — 发布准备文档

> **日期**: 2026-06-27
> **基于**: openlobby 项目实战踩坑，完善基础设施
> **源路径**: `/opt/ai-dev-flow-server/`

---

## 一、已修复文件（需覆盖到源）

### 1. `archon/auto-execute-afk.yaml` — Archon 工作流加固

**改动**: implement 节点加 AC 盘点 + 新增 ac-verify 节点

**旧版问题**:
- implement 直接开始写代码，不检查已有改动
- 中断后重跑，看到已有代码改动就认为"已完成"
- 没有 AC 到代码的映射验证

**新版流程**:
```
implement(先盘点再补缺) → ac-verify(逐AC验证证据) → validate → review... → PR
```

**文件**: `/home/www/openlobby/.archon/workflows/auto-execute-afk.yaml`
→ 覆盖 `/opt/ai-dev-flow-server/archon/auto-execute-afk.yaml`

### 2. `knowledge/06-AFK脚本栈规范.md` — 陷阱清单更新

**改动**: 第七节"已知陷阱与防护"从 6 条扩展到 9 条 + 首次部署检查清单

**新增陷阱**:
| # | 陷阱 | 防护 |
|---|------|------|
| 1 | 手动 dispatch 被会话杀 | 只用 systemd timer |
| 2 | Archon workflow 路径错误 | 部署到 .archon/workflows/ |
| 3 | dispatch.log 属主错误 | install.sh chown |
| 4 | effort=medium 阻塞 | effort 字段对齐规则 |
| 5 | git push 无 upstream | install.sh 设置 |
| 6 | PRD 落入 issues/ | 出口检查 |
| 7-9 | 并发/通知/自检不一致 | 见文档 |

**文件**: `/home/www/openlobby/.devflow/knowledge/06-AFK脚本栈规范.md`
→ 覆盖 `/opt/ai-dev-flow-server/knowledge/06-AFK脚本栈规范.md`

---

## 二、install.sh 需修改（5 处）

### 修改 1: 复制 workflow 到 `.archon/workflows/`（步骤 5 之后新增）

**问题**: archon 只扫描 `.archon/workflows/`，不扫描 `.devflow/archon/`
**位置**: install.sh 步骤 5（约第 206 行）之后

```bash
# ── 5b. 复制 Archon workflow 到 .archon/workflows/ ──
echo "── 步骤 5b: 复制 Archon workflow ──"
mkdir -p "$TARGET/.archon/workflows"
cp "$SOURCE/archon/auto-execute-afk.yaml" "$TARGET/.archon/workflows/"
echo "  ✅ auto-execute-afk.yaml → .archon/workflows/"
echo ""
```

### 修改 2: 创建 logs/ 目录并设权限（步骤 5b 之后）

**问题**: systemd service 以 root 首次运行创建 root-owned 日志文件，后续 www 用户不可写
**位置**: 紧随步骤 5b

```bash
# ── 5c. 创建日志目录 ──
echo "── 步骤 5c: 创建日志目录 ──"
mkdir -p "$TARGET/logs"
chown -R www:www "$TARGET/logs" 2>/dev/null || true
echo "  ✅ logs/ 已创建"
echo ""
```

### 修改 3: 首次 git push 确保 upstream（步骤 5c 之后）

**问题**: 新项目分支无 upstream tracking，dispatch.sh 的 `git push` 会失败
**位置**: 紧随步骤 5c

```bash
# ── 5d. 首次 push 确保 upstream ──
echo "── 步骤 5d: 确保 git upstream ──"
cd "$TARGET"
CURRENT_BRANCH=$(git branch --show-current)
if git rev-parse --abbrev-ref "${CURRENT_BRANCH}@{upstream}" >/dev/null 2>&1; then
    echo "  ✅ upstream 已设置"
else
    git push --set-upstream origin "$CURRENT_BRANCH" 2>/dev/null || \
        echo "  ⚠️  无法自动设置 upstream，请手动 git push --set-upstream"
fi
echo ""
```

### 修改 4: 更新 root 段 — 加入 logs/ 权限和 workflow 说明

**位置**: root 段输出（约第 317 行之前）

在 root 段检查清单中加入：
```
echo "  [ ] mkdir -p ${TARGET}/logs && chown www:www ${TARGET}/logs"
```

### 修改 5: 将 archon workflow 从 `.devflow/archon/` 也保留（兼容性）

**位置**: 步骤 5 已有的 cp 行（第 193 行）

保留现有 `cp "$SOURCE/archon/auto-execute-afk.yaml" "$TARGET/.devflow/archon/"` 不动。新增 `.archon/workflows/` 副本（修改 1），两处都放。

---

## 三、templates/ 文件修改

### `templates/issue-template.md` — 加 effort 字段说明

**问题**: effort 字段 `medium` 会被 check_constitution.py 标记 warning=fail

**改动**: 在 frontmatter 注释中加说明

```yaml
---
type: AFK
estimate: 0.5d
effort: small          # small(<1d) | medium(1-2d) | large(>2d, 禁止ready)
status: backlog
...
---
```

---

## 四、发布检查清单

- [ ] 覆盖源文件: auto-execute-afk.yaml, 06-AFK脚本栈规范.md
- [ ] install.sh 加入修改 1-5
- [ ] templates/issue-template.md 更新 effort 说明
- [ ] 版本号 bump（README.md 或 VERSION 文件）
- [ ] 在新项目执行 `bash install.sh` 端到端验证
- [ ] 验证清单:
  - [ ] `.archon/workflows/auto-execute-afk.yaml` 存在
  - [ ] `logs/` 属主 www
  - [ ] `git push` 有 upstream
  - [ ] `archon workflow list` 显示 auto-execute-afk
  - [ ] `dispatch-*.timer` active
- [ ] 更新 README.md 版本号 + changelog

---

## 五、未覆盖项（需后续改进）

| 项 | 说明 |
|----|------|
| check_constitution.py | warning 和 fail 未区分，均计入 failed 计数。建议改为 warning 不阻塞 |
| cross-review 节点 | 依赖 mini-router (localhost:3457)，离线时跳过。可改为可选依赖 |
| notify.py | Telegram 不可达时 fallback log，但审批人看不到。可加 GitHub PR review request 替代 |
| reconciler.sh | 超时回收阈值 6h 可能太短，需根据实际 Archon 执行时长调整 |
