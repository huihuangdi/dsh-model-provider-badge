# dsh-model-provider-badge

中文 | [English](README.md)

Shows **the provider behind the model the current session is using** as a compact badge in the DSH Web
composer tool row, immediately left of the model selector.

![The provider badge in the composer tool row, left of the model selector](assets/screenshot-1.png)

## What it shows

- The provider name is the Host model catalog group that owns the current model
  (`ModelProviderGroup.name`), so it matches the provider headings in the `/model` popup and in the
  model selector.
- It reads the **same** per-session model directory the model selector renders from (the client
  `modelDirectories` service): a session that has not picked a model yet shows the deployment
  default's provider, and switching models updates the badge immediately.
- If a provider has disappeared from the catalog, the badge falls back to the last advertised failure
  name and finally to the raw provider id.

## Install

```sh
dsh plugin --profile web add github:huihuangdi/dsh-model-provider-badge
```

Reload the page once after installing — the client half is loaded by the Web shell, not by the Host.
A local directory works too:

```sh
dsh plugin --profile web add /path/to/dsh-model-provider-badge
```

No build step: plain JavaScript with no install or lifecycle scripts, so no `allowBuilds` approval is
involved.

## Where it renders, and how

- Seat: `conversation.input.right`, declared by `@deepseek-ai/dsh-client-ui-conversation`. In the DOM
  that seat renders immediately before the model selector — the empty space left of the model name.
- `index.js` is the Host half: a normal plugin row, plus one write-only diagnostic route registered
  when the profile has a Web server.
- `client.js` is the browser half. It is loaded through `window.__ModuleLoader__` and claims the seat
  with `ctx.slots.inject(...)` + `ctx.slots.register(...)`.
- Styling uses host theme tokens only (`--dsw-alias-*`, `--dsw-radius-sm`), and the metrics mirror the
  host's model seat (28px high, 13px/400 type, 4px gap), so the badge reads as part of the same row.
- Visible copy goes through the client locale (namespace `model-provider-badge`, zh + en).

## Regression selftest

```sh
node test/activation.selftest.mjs
```

It reproduces the browser's service topology — services provided by *sibling* plugins, not mounted on
the root — with the real `@deepseek-ai/cordis`, and asserts that activation succeeded, that the locale
dictionaries and the seat registration happened, and that the injected face carries only values that
are safe to cache. Point it at a non-default DSH install with `DSH_INSTALL=<@deepseek-ai/dsh dir>`.

## License

MIT — see [LICENSE](LICENSE).
