/**
 * Host half of the model-provider badge bundle.
 *
 * Everything the user sees is rendered by the browser half (`./client`), which
 * claims the empty `conversation.input.right` seat in the composer tool row.
 *
 * This half exists for two reasons:
 *  1. a normal plugin row (enable/disable, inventory metadata, icon, locale);
 *  2. one write-only diagnostic route. The badge can fail on the client in ways
 *     no host-side inspection can see (slot render errors, a session whose model
 *     directory never resolves). The browser half posts an anomaly report here
 *     and it is appended to a log file, so a silently missing badge always
 *     leaves evidence. A healthy page load writes nothing.
 */
import { appendFile } from 'node:fs/promises';

/** Anomaly report endpoint, fetched by the browser half relative to the document. */
const REPORT_PATH = '/model-provider-badge/report';
/** Append-only anomaly log read by its maintainer. */
const REPORT_LOG = '/tmp/model-provider-badge.log';
/** Refuse oversized bodies instead of buffering them. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Register the anomaly report route.
 * @param ctx - plugin context carrying the optional Web server.
 */
function registerReportRoute(ctx) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: REPORT_PATH,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        appendFile(REPORT_LOG, `${new Date().toISOString()} ${body}\n`).catch(() => {});
        res.writeHead(204);
        res.end();
      });
    },
  }), 'model-provider-badge: anomaly report route');
}

/**
 * Host plugin body.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  // No Web server in a non-Web profile: the badge simply has no report sink.
  ctx.inject(['webServer'], (scope) => {
    registerReportRoute(scope);
  });
}
