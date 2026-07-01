---
title: "在页面顶部添加红色测试标题"
status: ready
type: AFK
estimate: 1h
effort: small
blocked_by: []
needs:
  llm: claude
test_files: "N/A"
acceptance_criteria:
  - "在 index.html 的 body 开头添加红色 h1 标签: AFK Test OK"
---

## 描述

在页面最顶部（body 开头）添加一行：

```html
<h1 style="color: red;">AFK Test OK</h1>
```

## 约束

- 严格只实现 AC 列出的内容
- 禁止修改无关文件
- 禁止重构
