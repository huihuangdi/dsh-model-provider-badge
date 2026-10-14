# dsh-model-provider-badge

[English](README.en.md) | 中文

在 DSH Web 输入框的工具行里，紧挨着模型选择器左侧显示**当前会话所用模型的供应商**。

![输入框工具行里的供应商徽标，位于模型选择器左侧](assets/screenshot-1.png)

## 它显示什么

- 供应商名称取自 Host 模型目录里该模型所属的分组名（`ModelProviderGroup.name`），与 `/model`
  弹窗、模型选择器里的分组标题一致。
- 数据源是与模型选择器**同一个** per-session 模型目录（client 服务 `modelDirectories`）：
  还没选过模型的新会话显示部署默认模型的供应商，切换模型后立即跟着变。
- 供应商已从目录移除时，依次退回上一次广告到的失败名，再退回供应商 id 本身。

## 安装

```sh
dsh plugin --profile web add github:huihuangdi/dsh-model-provider-badge
```

装完**刷新一次页面**——客户端半边由 Web 外壳加载，不由 Host 加载。也可以直接指向本地目录：

```sh
dsh plugin --profile web add /path/to/dsh-model-provider-badge
```

无构建步骤：纯 JavaScript，没有 install / 生命周期脚本，不涉及 `allowBuilds` 授权。

## 位置与实现

- 座位：`conversation.input.right`（由 `@deepseek-ai/dsh-client-ui-conversation` 声明），
  在 DOM 中渲染于模型选择器之前——也就是模型名左边的空位。
- `index.js`：Host 半边，一个普通插件行，外加一个只在 profile 有 Web server 时注册的
  只写诊断路由。
- `client.js`：浏览器半边，经 `window.__ModuleLoader__` 加载，用 `ctx.slots.inject(...)` +
  `ctx.slots.register(...)` 占住座位。
- 样式只用主题 token（`--dsw-alias-*`、`--dsw-radius-sm`），尺寸对齐宿主模型座位
  （28px 高、13px/400 字号、4px 间距），因此和同一行的控件是一套视觉。
- 文案走 client locale（命名空间 `model-provider-badge`，内置 zh / en）。

## 自检

```sh
node test/activation.selftest.mjs
```

用真实 `@deepseek-ai/cordis` 复刻浏览器里的服务拓扑（服务由**兄弟插件**提供，而不是挂在 root 上），
断言插件激活成功、词典与座位注册成功、注入面只带可安全缓存的值。DSH 装在非默认位置时用
`DSH_INSTALL=<@deepseek-ai/dsh 目录>` 指定。

## 许可

MIT，见 [LICENSE](LICENSE)。
