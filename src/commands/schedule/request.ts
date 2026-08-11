/**
 * HTTP request helper for schedule CLI commands.
 * Sends an HTTP request to the Furina backend service.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import http from 'http';

/**
 * Sends an HTTP request to the Furina backend on localhost:port.
 * @param port - The port number of the backend service
 * @param method - HTTP method (e.g. POST, DELETE)
 * @param path - API path (e.g. /furina/api/schedule/restart)
 * @returns A promise that resolves when a 2xx response is received
 * @throws Error if the request fails, times out, or returns non-2xx
 */
export function sendApiRequest(port: number, method: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`API request returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timed out'));
    });

    req.end();
  });
}
