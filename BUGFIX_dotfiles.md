# BugFix: NotFoundError on SPA fallback (res.sendFile 404)

## 复现条件

访问任意 SPA 深链接（如 `/openpowers/ui/some/deep/route`），服务器返回 404 HTML 错误页而非 `index.html`。

```bash
curl http://localhost:3939/openpowers/ui/some/deep/route
# → 404 NotFoundError
```

## 根因

链路：`~/.nvm/.../openpowers/dist/client/index.html` 路径中包含 `.nvm` 目录，被底层 `send` 库判定为 dotfile（隐藏目录），默认策略 `dotfiles: 'ignore'` 下返回 404。

```
/home/yupd/.nvm/versions/node/v22.22.3/lib/node_modules/@meiyukichan/openpowers/dist/client/index.html
        ↑
     .nvm 以 . 开头 → send 库 containsDotFile() 返回 true
                    → this._dotfiles = 'ignore'（默认）
                    → this.error(404)
                    → Express 5 sendFile 回调 next(err)
                    → Express 默认 error handler 渲染 404 HTML
```

### 关键代码路径

| 层 | 文件 | 行为 |
|---|------|------|
| `send` 库 | `node_modules/send/index.js:468` | `containsDotFile(parts)` 击中 `.nvm`，调用 `this.error(404)` |
| `send` 库 | `node_modules/send/index.js:807-816` | `part.length > 1 && part[0] === '.'` 判定 dotfile |
| Express 5 | `node_modules/express/lib/response.js:411-418` | 回调中 `next(err)` 将 404 传给 error handler |
| OpenPowers | `dist/server/index.js:42` | SPA fallback `res.sendFile()` 未传 `dotfiles` 选项 |

## 修复

**文件**: `dist/server/index.js:42`

```diff
- res.sendFile(path.join(clientDir, 'index.html'))
+ res.sendFile(path.join(clientDir, 'index.html'), { dotfiles: 'allow' })
```

添加 `{ dotfiles: 'allow' }` 选项，告知 `send` 库允许访问处于 dot-directory 路径下的文件。

## 验证

```bash
# 重启服务后
curl -s -o /dev/null -w "%{http_code}" http://localhost:3939/openpowers/ui/some/deep/route
# → 200

curl -s http://localhost:3939/openpowers/ui/some/deep/route | head -1
# → <!DOCTYPE html>
```

## 长期建议

此修复直接改编译产物 `dist/server/index.js`，`npm install` 或重新构建后会丢失。需要在源码仓库的 `src/server/index.ts` 中同步修改：

```typescript
// SPA fallback
app.use('/openpowers/ui', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'), { dotfiles: 'allow' });
});
```

## 日期

2026-06-08
