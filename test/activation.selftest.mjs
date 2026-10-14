/**
 * Offline activation selftest for the browser half (client.js).
 *
 * Why this exists: in this runtime a client plugin reaches another plugin's
 * Service (`slots`, `locale`, `modelDirectories`) ONLY through its own `inject`
 * list or through `ctx.inject([...], ...)`. Reading an undeclared service throws
 * `cannot get property "<name>" without inject`; a throw escaping `apply` fails
 * client-plugin activation and the Web shell reports "Failed to load plugins"
 * instead of booting the GUI. That regression shipped once, so this test
 * reproduces the real topology — services provided by SIBLING plugins, not on
 * the root context — and asserts the activation actually produced its effects.
 *
 * It is an activation test, not a rendering test: React is stubbed and no DOM is
 * emulated. Visual verification stays with the connected page.
 *
 * Usage: node test/activation.selftest.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Locate `@deepseek-ai/cordis` inside a DSH installation: `DSH_INSTALL` first,
 * then the global npm root (where `npm i -g @deepseek-ai/dsh` puts it), then the
 * checkout default of the machine this plugin was written on.
 * @returns absolute path of the cordis entry module.
 */
function resolveCordis() {
  const candidates = [];
  if (process.env.DSH_INSTALL) {
    candidates.push(join(process.env.DSH_INSTALL, 'node_modules/@deepseek-ai/cordis/lib/index.js'));
  }
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (root !== '') {
      candidates.push(join(root, '@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js'));
    }
  } catch {
    /* npm missing is fine; the other candidates may still resolve */
  }
  candidates.push(
    '/root/.nvm/versions/node/v22.23.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
  );
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    console.log('FAIL could not locate @deepseek-ai/cordis.');
    console.log('     Set DSH_INSTALL to the installed @deepseek-ai/dsh directory and retry.');
    process.exit(2);
  }
  return found;
}

const CORDIS = resolveCordis();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
    failures.push(label);
  }
}

const { Context } = await import(pathToFileURL(CORDIS).href);

// ── load the browser half exactly as the page's module loader would ──────────
let registration;
const ReactStub = {
  createElement: () => null,
  Fragment: Symbol('Fragment'),
  useCallback: (fn) => fn,
  useSyncExternalStore: () => null,
};
runInNewContext(readFileSync(join(here, '..', 'client.js'), 'utf8'), {
  window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
  console,
});
if (registration === undefined) {
  console.log('FAIL client.js never called window.__ModuleLoader__.load');
  process.exit(1);
}
const exports = registration.factory((specifier) => {
  if (specifier === 'react') return ReactStub;
  throw new Error(`unexpected require("${specifier}")`);
});

// ── sibling-plugin service topology ─────────────────────────────────────────
const recorded = { locales: [], slotInjects: [], registrations: [] };
const directoryStore = {
  getSnapshot: () => ({
    current: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    groups: [{ id: 'opencode-go', name: 'opencode-go', models: [] }],
    failures: [],
  }),
  subscribe: () => () => {},
};

const root = new Context();
root.plugin({
  name: 'provider:locale',
  apply(c) {
    c.provide('locale', {
      register: (ns, dicts) => {
        recorded.locales.push({ ns, locales: Object.keys(dicts) });
        return () => {};
      },
    });
  },
});
root.plugin({
  name: 'provider:slots',
  apply(c) {
    c.provide('slots', {
      inject: (key, callback) => {
        recorded.slotInjects.push(key);
        callback();
        return () => {};
      },
      register: (options, component) => {
        recorded.registrations.push({ options, component });
        return () => {};
      },
    });
  },
});
root.plugin({
  name: 'provider:modelDirectories',
  apply(c) {
    c.provide('modelDirectories', {
      directoryFor: (sessionId) => {
        if (sessionId !== 'session-1') throw new Error(`unknown session ${String(sessionId)}`);
        return { store: directoryStore };
      },
    });
  },
});
await sleep(30);

console.log(`activation selftest — ${registration.id}`);
check('exports carry apply()', typeof exports.apply === 'function');
check('exports declare slots', Array.isArray(exports.inject) && exports.inject.includes('slots'),
  `inject=${JSON.stringify(exports.inject)}`);
check('exports declare locale (service is read directly)', Array.isArray(exports.inject) && exports.inject.includes('locale'),
  `inject=${JSON.stringify(exports.inject)}`);

const fiber = root.plugin(exports);
await sleep(60);

// ACTIVE === 2 (cordis const enum); FAILED === 3 would mean apply threw.
check('plugin fiber is active (apply did not throw)', fiber?.state === 2, `state=${String(fiber?.state)}`);
check('registered the model-provider-badge locale dictionaries',
  recorded.locales.length === 1
    && recorded.locales[0].ns === 'model-provider-badge'
    && recorded.locales[0].locales.join(',') === 'zh,en',
  JSON.stringify(recorded.locales));
check('waited on the conversation.input.right declaration',
  recorded.slotInjects.includes('conversation.input.right'), JSON.stringify(recorded.slotInjects));
check('registered exactly one seat occupant', recorded.registrations.length === 1,
  `count=${String(recorded.registrations.length)}`);

const seat = recorded.registrations[0]?.options ?? {};
check('seat id is model-provider-badge', seat.id === 'model-provider-badge', JSON.stringify(seat));
check('seat carries the locale namespace', seat.locale === 'model-provider-badge');
check('seat declares an inject face', typeof seat.inject === 'function');
check('seat component is a function', typeof recorded.registrations[0]?.component === 'function');

const injected = typeof seat.inject === 'function' ? seat.inject('session-1') : {};
check('inject face exposes the model directory service',
  injected.models === undefined ? false : typeof injected.models.directoryFor === 'function',
  JSON.stringify(Object.keys(injected)));
check('inject face carries the binding session id (never a resolved store)',
  injected.boundSessionId === 'session-1' && injected.directory === undefined,
  JSON.stringify(Object.keys(injected)));
// The renderer caches this face for the whole life of one (entry x binding), so
// it must never contain a derived value that a transient failure could poison.
const injectedOther = typeof seat.inject === 'function' ? seat.inject('session-2') : null;
check('inject face is rebuilt per binding without capturing a resolution result',
  injectedOther !== null && injectedOther.models === injected.models
    && injectedOther.boundSessionId === 'session-2' && injectedOther.directory === undefined);
check('service resolves the session directory store',
  injected.models.directoryFor('session-1').store === directoryStore);
let threwForUnknown = false;
try {
  injected.models.directoryFor('nope');
} catch (error) {
  threwForUnknown = true;
}
check('service still rejects an unknown session (component catches it per render)', threwForUnknown);

console.log(failures.length === 0
  ? '\nPASS — activation is clean'
  : `\nFAIL — ${String(failures.length)} check(s) failed: ${failures.join('; ')}`);
process.exit(failures.length === 0 ? 0 : 1);
