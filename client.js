/**
 * Browser half of the model-provider badge bundle.
 *
 * Claims the `conversation.input.right` seat of the composer tool row, which the
 * conversation plugin renders immediately before the model selector — the empty
 * slot left of the model name.
 *
 * Data source: the client-side `modelDirectories` service owned by
 * `@deepseek-ai/dsh-client-ui-model-selection`. `directoryFor(sessionId)` hands
 * back the very same per-session directory the model selector renders from, so
 * the badge always agrees with the visible model name (saved selection folded
 * with the Host model catalog, including the deployment default for sessions
 * that have not selected yet). The provider's display name comes from the
 * catalog group that owns the current model; removed providers fall back to the
 * last advertised failure name, then to the raw provider id.
 *
 * Two runtime rules this file exists to respect (both were learned the hard way):
 *
 *  1. SERVICE ACCESS. A sibling plugin's service (`slots`, `locale`,
 *     `modelDirectories`) is reachable only through the plugin's own `inject`
 *     list or through `ctx.inject([...], ...)`. Reading a bare `ctx.<service>`
 *     that is not declared throws `cannot get property "<name>" without inject`,
 *     which fails client-plugin activation and makes the shell refuse to boot
 *     the whole GUI ("Failed to load plugins").
 *  2. THE INJECT FACE IS CACHED. The renderer computes an entry's injected props
 *     ONCE per (entry x session binding) and caches them for that binding's
 *     whole life. A face that captured a failure (for example an empty object
 *     after `directoryFor` threw once, while the session binding was still
 *     forming) would therefore stay empty forever and the badge would silently
 *     never render. The injected face below carries only the service and the
 *     session id — no derived, failure-prone value — and the component resolves
 *     the directory store on every render, retrying briefly if it is not ready.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-provider-badge',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace of this plugin's runtime dictionaries. */
    const NS = 'model-provider-badge';
    /** Anomaly report endpoint served by this package's Host half. */
    const REPORT_ROUTE = 'model-provider-badge/report';
    /** Retry budget while a session's model directory is still forming. */
    const RESOLVE_RETRIES = 10;
    const RESOLVE_RETRY_MS = 300;

    const zh = {
      label: '供应商',
      tooltip: '当前模型供应商：{name}',
    };
    const en = {
      label: 'Provider',
      tooltip: 'Current model provider: {name}',
    };

    /** Component-local styles; rendered as a React element so unmounting removes them. */
    const CSS = [
      // Metrics mirror the host's own composer controls (the model seat trigger is
      // height:28px / font-size:13px / font-weight:400 / line-height:20px / gap:4px),
      // so the badge reads as part of the same tool row instead of a cramped chip.
      // `flex:0 0 auto` + `white-space:nowrap` keep the text from ever being
      // squeezed; only an over-long provider name may ellipsize (name is the one
      // shrinkable child).
      '.dsw-mpb{display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;',
      'flex:0 0 auto;height:28px;max-width:280px;padding:0 8px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);',
      'background:transparent;color:var(--dsw-alias-label-secondary);',
      'font-size:13px;font-weight:400;line-height:20px;white-space:nowrap;',
      'user-select:none;cursor:default;}',
      '.dsw-mpb-dot{flex:none;width:6px;height:6px;border-radius:50%;',
      'background:var(--dsw-alias-brand-primary);}',
      // Full-strength token, no extra opacity: dimming an already-muted colour is
      // what made the CJK label look half-rendered at this size.
      '.dsw-mpb-label{flex:none;color:var(--dsw-alias-label-secondary);}',
      '.dsw-mpb-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;',
      'color:var(--dsw-alias-label-primary);}',
    ].join('');

    /** Reports sent from this page load; a hard cap keeps a broken page from flooding. */
    let reportsSent = 0;
    /** One positive beacon per page load proves the pill reached the render tree. */
    let renderedOnce = false;

    /**
     * Post one anomaly report to this package's Host half.
     * Diagnostics must never affect the badge, so every failure is swallowed.
     * @param event - short anomaly name.
     * @param details - JSON-serializable context.
     */
    function report(event, details) {
      if (reportsSent >= 20) return;
      reportsSent += 1;
      try {
        const payload = JSON.stringify({
          event,
          details,
          href: String(globalThis.location?.href ?? ''),
        });
        const navigatorRef = globalThis.navigator;
        if (typeof navigatorRef?.sendBeacon === 'function' && navigatorRef.sendBeacon(REPORT_ROUTE, payload)) return;
        if (typeof globalThis.fetch === 'function') {
          void globalThis.fetch(REPORT_ROUTE, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
        }
      } catch (error) {
        /* reporting is best-effort by contract */
      }
    }

    /**
     * Resolve the shared per-session model directory store.
     * Called on every render on purpose: the directory itself is cached by the
     * service, so this is a lookup, and a not-yet-formed session binding is
     * retried instead of being memoized as a permanent miss.
     * @param models - injected `modelDirectories` service.
     * @param sessionId - current session of the composer.
     * @returns the directory store, or undefined while it cannot be resolved.
     */
    function resolveDirectory(models, sessionId) {
      if (models === undefined || models === null || sessionId === undefined) return undefined;
      try {
        return models.directoryFor(sessionId).store;
      } catch (error) {
        report('directory-unresolved', {
          sessionId: String(sessionId),
          message: String(error?.message ?? error),
        });
        return undefined;
      }
    }

    /**
     * Resolve the display name of one provider from a directory snapshot.
     * @param state - current `ModelDirectoryState` (never null here).
     * @param provider - provider id of the current selection.
     * @returns the catalog name, the last advertised failure name, or the id.
     */
    function providerNameOf(state, provider) {
      const group = state.groups.find((candidate) => candidate.id === provider);
      if (group !== undefined) return group.name;
      const failure = state.failures.find((candidate) => candidate.id === provider);
      if (failure !== undefined) return failure.name;
      return provider;
    }

    /** Subscribe to one directory store; a missing store subscribes to nothing. */
    function useDirectoryState(store) {
      const subscribe = React.useCallback(
        (onChange) => (store === undefined ? () => {} : store.subscribe(onChange)),
        [store],
      );
      const getSnapshot = React.useCallback(
        () => (store === undefined ? null : store.getSnapshot()),
        [store],
      );
      return React.useSyncExternalStore(subscribe, getSnapshot);
    }

    /**
     * Render the badge, containing any render failure so the slot entry reports
     * it instead of taking the composer down with it.
     * @param props - injected `models` service, the `sessionId` seat and locale `t`.
     * @returns the pill, or null while no provider is known yet.
     */
    function ProviderBadge(props) {
      try {
        return renderBadge(props);
      } catch (error) {
        report('render-error', { message: String(error?.message ?? error) });
        throw error;
      }
    }

    /**
     * Render the pill itself.
     * @param props - injected `models` service, the `sessionId` seat and locale `t`.
     * @returns the pill, or null while the store or its selection is missing.
     */
    function renderBadge(props) {
      const t = props.t;
      const [attempt, setAttempt] = React.useState(0);
      // The face carries the binding's own session id, exactly as the shipped
      // model seat receives it; the standard prop is the fallback.
      const sessionId = props.sessionId === undefined ? props.boundSessionId : props.sessionId;
      const store = resolveDirectory(props.models, sessionId);

      // A session whose binding is still forming resolves a moment later: retry
      // a bounded number of times instead of caching the miss (see rule 2 above).
      React.useEffect(() => {
        if (store !== undefined || attempt >= RESOLVE_RETRIES) return undefined;
        const timer = setTimeout(() => setAttempt(attempt + 1), RESOLVE_RETRY_MS);
        return () => clearTimeout(timer);
      }, [store, attempt]);

      const state = useDirectoryState(store);

      // A store that never produces a selection means the Host model catalog did
      // not reach this page: leave an anomaly trail rather than rendering nothing.
      React.useEffect(() => {
        if (store === undefined || state === null || state.current !== null) return undefined;
        const timer = setTimeout(
          () => report('no-current-selection', { status: state.status, groups: state.groups.length }),
          3000,
        );
        return () => clearTimeout(timer);
      }, [store, state]);

      if (state === null || state.current === null) return null;
      const name = providerNameOf(state, state.current.provider);
      if (name === undefined || name === '') return null;
      if (!renderedOnce) {
        renderedOnce = true;
        report('render-ok', { provider: name, sessionId: String(sessionId ?? '') });
      }
      const caption = t('tooltip', { name });
      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, CSS),
        h(
          'span',
          { key: 'badge', className: 'dsw-mpb', title: caption, 'aria-label': caption },
          h('span', { className: 'dsw-mpb-dot', 'aria-hidden': true }),
          h('span', { className: 'dsw-mpb-label' }, t('label')),
          h('span', { className: 'dsw-mpb-name' }, name),
        ),
      );
    }

    return {
      // `slots` and `locale` are sibling plugins' services: every one this body
      // touches must be declared here (see the file header).
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A throw escaping `apply` fails client-plugin activation, and the shell
        // then refuses to boot the whole GUI ("Failed to load plugins"). A
        // decorative badge must never cost the user their application.
        try {
          ctx.effect(
            () => ctx.locale.register(NS, { zh, en }),
            'model-provider-badge: dictionaries',
          );
          // Optional per-session service: `ctx.inject` keeps this plugin
          // inactive (not failed) in a profile without model selection.
          ctx.inject(['slots', 'modelDirectories'], (scope) => {
            const models = scope.modelDirectories;
            scope.slots.inject('conversation.input.right', () =>
              scope.slots.register(
                {
                  name: 'conversation.input.right',
                  id: 'model-provider-badge',
                  order: 0,
                  locale: NS,
                  // Failure-free face: the service and this binding's session id
                  // only. The directory store is resolved per render by the
                  // component, so a transient miss is never memoized.
                  inject: (sessionId) => ({ models, boundSessionId: sessionId }),
                },
                ProviderBadge,
              ),
            );
          });
        } catch (error) {
          report('apply-error', { message: String(error?.message ?? error) });
          console.error('[model-provider-badge] activation failed:', error);
        }
      },
    };
  },
});
