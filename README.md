# dsh-model-provider-badge

English | [中文](README.zh.md)

Shows **the provider behind the model the current session is using** as a compact badge in the
DeepSeek Harness (DSH) Web composer tool row, immediately left of the model selector.

![The provider badge in the composer tool row, left of the model selector](assets/screenshot-1.png)

```
[+] [workspace write]        [● Provider opencode-go] [DeepSeek V4.1 Flash High ⌄] [↑]
                                ^^^^^^^^^^^^^^^^^^^^^^ added by this plugin
```

## What it shows

- The provider name is the Host model catalog group that owns the current model
  (`ModelProviderGroup.name`), so it always matches the provider headings in the `/model` popup and
  in the model selector itself.
- It reads the **same** per-session model directory the model selector renders from (the client
  `modelDirectories` service), so a fresh session that has not picked a model yet shows the
  deployment default's provider, and switching models updates the badge immediately.
- If a provider has disappeared from the catalog, the badge falls back to the last advertised
  failure name and finally to the raw provider id.

## Install

```sh
dsh plugin --profile web add github:huihuangdi/dsh-model-provider-badge
```

or install it as a local directory:

```sh
dsh plugin --profile web add /path/to/dsh-model-provider-badge
```

No build step: the package is plain JavaScript with no install or lifecycle scripts, so no
`allowBuilds` approval is involved. Reload the page after installing — the client half is loaded by
the Web shell, not by the Host.

## Where it renders, and how

- Seat: `conversation.input.right`, declared by `@deepseek-ai/dsh-client-ui-conversation`. In the
  DOM that seat renders immediately **before** the model seat (`conversation.input.model`) — the
  empty space left of the model name.
- `index.js` is the Host half: a normal plugin row, plus one write-only diagnostic route registered
  when the profile has a Web server.
- `client.js` is the browser half. It is loaded through `window.__ModuleLoader__` and claims the seat
  with `ctx.slots.inject(...)` + `ctx.slots.register(...)`.
- Styling uses host theme tokens only (`--dsw-alias-*`, `--dsw-radius-sm`), and the metrics mirror the
  host's own model-seat trigger (28px high, 13px/400 type, 4px gap) so the badge reads as part of the
  same row instead of a shrunken chip.
- Visible copy goes through the client locale (namespace `model-provider-badge`, zh + en).

## Notes for anyone writing a DSH client plugin

Four things that cost a day here; each one is reproducible from the source in this repository.

1. **Declare every service you read.** A sibling plugin's service is reachable only through your own
   `inject` list or through `ctx.inject([...], ...)`. Reading an undeclared `ctx.locale` throws
   `cannot get property "locale" without inject`, and an exception escaping `apply` fails
   client-plugin activation: the shell then refuses to boot the whole GUI ("Failed to load plugins")
   rather than merely losing your decoration.

2. **The renderer caches an entry's injected props for the life of one (entry × session binding).**
   `cachedRootInject` / `cachedSessionInject` compute them once and keep them. So never put a derived,
   failure-prone value in there: `dsh-api-session-controller`'s `binding(id)` is a *borrow*
   (`return this.scopes.get(id)?.binding`) and returns `undefined` until the session scope is
   retained, which makes `modelDirectories.directoryFor(sessionId)` throw `... resolved no binding`.
   Catching that and returning `{}` gets memoized for the rest of the page's life — the seat
   registers, reports `active: true`, logs nothing, and never renders. Resolve that kind of value per
   render inside the component instead, and retry briefly while a session is still materializing.

3. **Match the host's control metrics; never stack `opacity` on an already-muted token.** The first
   version used 24px/12px with `opacity: .75` over `--dsw-alias-label-secondary`; at 12px the CJK
   label looked half-rendered, which is exactly how a user reported it.

4. **A silent failure must leave evidence.** The Host half registers
   `POST /model-provider-badge/report`; the browser half appends anomalies to
   `/tmp/model-provider-badge.log` (a healthy page writes a single `render-ok` line). That log is what
   tells "the module never ran" apart from "`apply` threw" apart from "it renders but is squeezed to
   zero width".

## Regression selftest

```sh
node test/activation.selftest.mjs
```

It reproduces the browser's service topology — services provided by *sibling* plugins, not mounted on
the root — with the real `@deepseek-ai/cordis`, then asserts that activation actually produced its
effects: the `inject` list covers what the body reads, `apply` does not throw, the locale dictionaries
and the seat registration happen, and the injected face carries only values that are safe to cache.

Point it at a non-default DSH install with `DSH_INSTALL=/path/to/@deepseek-ai/dsh`.

## License

MIT — see [LICENSE](LICENSE).
