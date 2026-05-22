/**
 * Session settings read/write utilities.
 * Reads and writes session configuration from ~/.openpowers/sessions/<id>/settings.json.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Session settings directory under user home
const SESSIONS_DIR = path.join(os.homedir(), '.openpowers', 'sessions');

/**
 * Session settings stored per session under ~/.openpowers/sessions/<id>/settings.json.
 */
export interface SessionSettings {
  /** Unique session identifier */
  sessionId: string;
  /** Working directory when session was created */
  cwd: string;
  /** Currently active provider name (stage/mode identifier) */
  currentProvider: string;
  /** Mapping from stage names to provider model names */
  switchProviders: Record<string, string>;
}

/**
 * Returns the full file path to a session's settings.json file.
 * Cross-platform compatible using path.join and os.homedir().
 * @param sessionId - The session identifier
 * @returns Absolute path to the settings.json file
 */
export function getSessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, 'settings.json');
}

/**
 * Reads and parses the session settings JSON file.
 * @param sessionId - The session identifier
 * @returns Parsed SessionSettings object, or null if the file does not exist
 */
export function readSessionSettings(sessionId: string): SessionSettings | null {
  const filePath = getSessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SessionSettings;
}

/**
 * Writes session settings to a formatted JSON file, creating directories as needed.
 * @param sessionId - The session identifier
 * @param settings - The settings object to write
 */
export function writeSessionSettings(sessionId: string, settings: SessionSettings): void {
  const filePath = getSessionFilePath(sessionId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}
