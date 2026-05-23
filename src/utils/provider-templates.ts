/**
 * Provider template read/write utilities.
 * Reads and writes provider preset templates from resources/claude-providers-template.json.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import fs from 'fs';
import path from 'path';
import url from 'url';

// Template file path resolved relative to this module
const moduleDirname = path.dirname(url.fileURLToPath(import.meta.url));
const TEMPLATES_PATH = path.join(moduleDirname, '..', '..', 'resources', 'claude-providers-template.json');

/**
 * A provider preset template stored in the JSON resource file.
 */
export interface ProviderTemplate {
  /** Unique template display name */
  name: string;
  /** Provider website URL for external link display */
  websiteUrl?: string;
  /** API base URL for the provider */
  baseUrl: string;
  /** SVG file name for brand icon (e.g. 'anthropic.svg') */
  iconSvg?: string;
  /** Default model identifier */
  defaultModel?: string;
  /** Sonnet-tier model identifier */
  sonnetModel?: string;
  /** Opus-tier model identifier */
  opusModel?: string;
  /** Haiku-tier model identifier */
  haikuModel?: string;
}

/**
 * Input type for adding a new provider template (same fields as ProviderTemplate).
 */
export type ProviderTemplateInput = Omit<ProviderTemplate, never>;

/**
 * Reads the full list of provider templates from the JSON resource file.
 * Returns an empty array when the file does not exist.
 * @returns The parsed template array
 */
export function readProviderTemplates(): ProviderTemplate[] {
  if (!fs.existsSync(TEMPLATES_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(TEMPLATES_PATH, 'utf-8');
  return JSON.parse(raw) as ProviderTemplate[];
}

/**
 * Appends a new template to the JSON resource file after validating that the
 * name is unique among existing templates. Throws an error if a template with
 * the same name already exists.
 * @param template - The template to add
 * @returns The newly added template object
 * @throws {Error} If a template with the same name already exists
 */
export function addProviderTemplate(template: ProviderTemplateInput): ProviderTemplate {
  const templates = readProviderTemplates();

  // Validate duplicate name
  const isDuplicate = templates.some((t) => t.name === template.name);
  if (isDuplicate) {
    throw new Error(`Template name "${template.name}" already exists`);
  }

  templates.push(template);
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
  return template;
}
