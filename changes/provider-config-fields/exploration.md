## Codebases Exploration

No codebases configured; skipped.

## Project Supplementary Exploration

### 1. Current Provider Data Model (openpowers) vs. cc-switch Comparison

#### 1.1 Current openpowers Provider Fields (src/server/providers-store.ts)

```typescript
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
```

Current form fields in AddProviderDialog (name, notes, websiteUrl, apiKey, baseUrl) and EditProviderDialog (same fields minus preset selector) map to this schema.

**Missing fields compared to cc-switch:**

| cc-switch Field (settingsConfig.env) | openpowers Equivalent | Status |
|---|---|---|
| `ANTHROPIC_MODEL` | `defaultModel` | **NOT PRESENT** |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `haikuModel` | **NOT PRESENT** |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `sonnetModel` | **NOT PRESENT** |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `opusModel` | **NOT PRESENT** |
| Provider name | `name` | Present |
| Website URL | `websiteUrl` | Present |
| ANTHROPIC_BASE_URL | `baseUrl` | Present |
| ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY | `apiKey` | Present |
| Notes/metadata | `notes` | Present |

#### 1.2 cc-switch Reference Model (ClaudeModelConfig)

From `D:/project-code/llm/cc-switch/src/types.ts`:
```typescript
export interface ClaudeModelConfig {
  model?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
}
```

From `D:/project-code/llm/cc-switch/src/config/claudeProviderPresets.ts`, the preset settingsConfig.env structure includes:
- `ANTHROPIC_BASE_URL` - Request address/base URL
- `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` - API Key field
- `ANTHROPIC_MODEL` - Default model
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` - Haiku model
- `ANTHROPIC_DEFAULT_SONNET_MODEL` - Sonnet model
- `ANTHROPIC_DEFAULT_OPUS_MODEL` - Opus model

Example preset with all model fields:
```typescript
{
  name: "OpenRouter",
  websiteUrl: "https://openrouter.ai",
  settingsConfig: {
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: "",
      ANTHROPIC_MODEL: "anthropic/claude-sonnet-4.6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "anthropic/claude-haiku-4.5",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-4.6",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "anthropic/claude-opus-4.7",
    },
  },
}
```

#### 1.3 Current openpowers Preset Data (src/client/data/presets.ts)

The current `ProviderPreset` interface only has: `name`, `websiteUrl?`, `baseUrl`, `icon`, `iconColor`. Missing: `apiKeyUrl`, `defaultModel`, `haikuModel`, `sonnetModel`, `opusModel`, `isPartner`, `category`, `notes`, `apiKeyField`.

#### 1.4 Current Add Form Fields (src/client/components/AddProviderDialog.tsx)

Current FormValues interface: `name`, `notes`, `websiteUrl`, `apiKey`, `baseUrl`.

Missing: `defaultModel`, `haikuModel`, `sonnetModel`, `opusModel`.

The test at line 177 explicitly verifies these fields are NOT shown:
```typescript
it('does not show advanced fields like model selector, speed test, or common config', () => {
    expect(screen.queryByText(/model selector/i)).not.toBeInTheDocument();
```

### 2. URL Paths: /ui vs /openpowers/ui and /api vs /openpowers/api

#### 2.1 Current Server-side Routes (src/server/index.ts)

```typescript
// API routes
app.use('/api/providers', providersRouter);

// UI static files
app.use('/ui', express.default.static(clientDir, { redirect: false }));
app.use('/ui', (_req, res) => { res.sendFile(path.join(clientDir, 'index.html')); });
```

#### 2.2 Current Client-side API Calls

All client-side `fetch()` calls use relative paths:

| File | Line | Path |
|---|---|---|
| `src/client/App.tsx:48` | `fetch('/api/providers/active')` |
| `src/client/App.tsx:108` | `fetch('/api/providers/reset', { method: 'POST' })` |
| `src/client/App.tsx:126` | `fetch('/api/providers/active', { method: 'PUT' })` |
| `src/client/components/AddProviderDialog.tsx:144` | `fetch('/api/providers', { method: 'POST' })` |
| `src/client/components/EditProviderDialog.tsx:116` | `fetch('/api/providers/${id}', { method: 'PUT' })` |
| `src/client/components/DeleteConfirmDialog.tsx:58` | `fetch('/api/providers/${id}', { method: 'DELETE' })` |
| `src/client/components/ProviderList.tsx:31` | `return '/api/providers'` |

#### 2.3 Current Test Files with Hardcoded Paths

**Server-side tests:**
- `src/server/index.test.ts:53` - `request(app).get('/api/providers')`
- `src/server/index.test.ts:61` - `request(app).get('/ui')`
- `src/server/index.test.ts:68` - `request(app).get('/ui/some/sub/path')`
- `src/server/index.test.ts:76` - `request(app).get('/ui/test.js')`
- `src/server/index.test.ts:85` - `request(app).get('/ui')`
- `src/server/index.test.ts:92` - `request(app).get('/ui/any/sub/path')`

- `src/server/routes/providers.test.ts:82` - `app.use('/api/providers', router)`
- `src/server/routes/providers.test.ts:96,105` - `request(app).get('/api/providers')`
- `src/server/routes/providers.test.ts:119,129,141` - `request(app).post('/api/providers')`
- `src/server/routes/providers.test.ts:158,175,184` - `request(app).put('/api/providers/...')`
- `src/server/routes/providers.test.ts:200` - `request(app).delete('/api/providers/...')`
- `src/server/routes/providers.test.ts:225,236` - `request(app).get('/api/providers/active')`
- `src/server/routes/providers.test.ts:250,264,277` - `request(app).put('/api/providers/active')`

**Client-side tests:**
- `src/client/components/AddProviderDialog.test.tsx:153` - `'/api/providers'`
- `src/client/components/EditProviderDialog.test.tsx:154` - `'/api/providers/test-id-1'`
- `src/client/components/DeleteConfirmDialog.test.tsx:113` - `'/api/providers/test-id-1'`

### 3. Files Requiring Changes (Summary)

#### For adding model fields (defaultModel, haikuModel, sonnetModel, opusModel):
1. `src/server/providers-store.ts` - Add to ProviderSchema, ProviderInputSchema, ProviderUpdateSchema
2. `src/client/data/presets.ts` - Add to ProviderPreset interface and preset data
3. `src/client/components/AddProviderDialog.tsx` - Add model form fields, update FormValues, preset selection
4. `src/client/components/EditProviderDialog.tsx` - Add model form fields, update FormValues
5. `src/client/components/ProviderCard.tsx` - Optionally display model info
6. `src/client/components/AddProviderDialog.test.tsx` - Update/remove the test that asserts no model selector
7. `src/server/providers-store.test.ts` - Update tests for new fields if needed

#### For URL prefix change (/ui -> /openpowers/ui, /api -> /openpowers/api):
1. `src/server/index.ts` - Update `app.use()` mount points
2. `src/client/App.tsx` - Update all `fetch()` calls (3 occurrences)
3. `src/client/components/AddProviderDialog.tsx` - Update `fetch()` call (1)
4. `src/client/components/EditProviderDialog.tsx` - Update `fetch()` call (1)
5. `src/client/components/DeleteConfirmDialog.tsx` - Update `fetch()` call (1)
6. `src/client/components/ProviderList.tsx` - Update `getApiUrl()` (1)
7. `src/server/index.test.ts` - Update all path assertions (11+ occurrences)
8. `src/server/routes/providers.test.ts` - Update all path assertions (15+ occurrences)
9. `src/client/components/AddProviderDialog.test.tsx` - Update fetch mock assertions
10. `src/client/components/EditProviderDialog.test.tsx` - Update fetch mock assertions
11. `src/client/components/DeleteConfirmDialog.test.tsx` - Update fetch mock assertions

## Reference Project Exploration

### cc-switch Provider Configuration (D:/project-code/llm/cc-switch/src/config/claudeProviderPresets.ts)

Key findings from the cc-switch reference:

**ProviderPreset interface has these core fields:**
- `name: string` - Provider name
- `websiteUrl: string` - Official website URL
- `apiKeyUrl?: string` - Separate URL to obtain API Key
- `settingsConfig: object` - Contains `env` with all env var settings
- `isOfficial?: boolean` / `isPartner?: boolean` - Status flags
- `category?: ProviderCategory` - Classification
- `apiKeyField?: "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY"` - Which env var to use for API key
- `apiFormat?: "anthropic" | "openai_chat" | "openai_responses" | "gemini_native"` - API protocol
- `icon?: string` / `iconColor?: string` - Visual theming

**settingsConfig.env contains model configuration:**
- `ANTHROPIC_BASE_URL` - Base request URL
- `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` - API Key
- `ANTHROPIC_MODEL` - Default model name
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` - Haiku-tier model
- `ANTHROPIC_DEFAULT_SONNET_MODEL` - Sonnet-tier model
- `ANTHROPIC_DEFAULT_OPUS_MODEL` - Opus-tier model

The cc-switch UniversalProvider uses a `ClaudeModelConfig` with: `model`, `haikuModel`, `sonnetModel`, `opusModel`.

Full preset count: 60+ presets including Claude Official and many third-party/aggregator providers.
