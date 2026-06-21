/**
 * Zod schemas for project-groups.json validation.
 * Used by the scheduler to programmatically reject malformed grouper output.
 */
import { z } from 'zod';
import fs from 'fs';

const ProjectGroupEntrySchema = z.object({
  projectGroup: z.string().min(1),
  projectDesc: z.string(),
  projectPortrait: z.string().min(1),
  members: z.array(z.string()),
  tags: z.array(z.string()),
  status: z.enum(['active', 'proposed', 'deprecated']).default('active'),
}).strict();

export const ProjectGroupsSchema = z.object({
  version: z.string(),
  lastUpdated: z.string(),
  groups: z.array(ProjectGroupEntrySchema),
}).strict();

export type ProjectGroupEntry = z.infer<typeof ProjectGroupEntrySchema>;
export type ProjectGroups = z.infer<typeof ProjectGroupsSchema>;

/**
 * Reads and validates a project-groups.json file.
 * Returns the parsed/validated data, or detailed error info on failure.
 */
export function validateProjectGroupsFile(filePath: string):
  | { ok: true; data: ProjectGroups }
  | { ok: false; error: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to read ${filePath}: ${msg}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON in ${filePath}: ${msg}` };
  }

  const result = ProjectGroupsSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed:\n${result.error.issues
        .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('\n')}`,
    };
  }

  return { ok: true, data: result.data };
}
