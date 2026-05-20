## Exploration Results

### Reference: cc-switch Repository

#### 1. Active Provider State Management (cc-switch App.tsx, lines 256-261)

cc-switch derives `activeProviderId` from proxy status data via `useMemo`, not as a standalone `useState`:

```ts
const activeProviderId = useMemo(() => {
  const target = proxyStatus?.active_targets?.find(
    (t) => t.app_type === activeApp,
  );
  return target?.provider_id;
}, [proxyStatus?.active_targets, activeApp]);
```

It is then passed directly to `ProviderList` as a prop (line 1016):

```tsx
<ProviderList
  activeProviderId={activeProviderId}
  // ...other props
/>
```

**Key difference for openpowers**: openpowers does not have a proxy layer. The active provider is stored server-side in `active-provider.json` and exposed via `GET /api/providers/active`. The frontend will need a `useState` + fetch-on-mount pattern instead of a derived `useMemo`.

---

#### 2. Enable Button Design (cc-switch ProviderActions.tsx, lines 111-207)

The enable button is driven by a `getMainButtonState()` function that returns `{ disabled, variant, className, icon, text }` based on the current state.

**OMO pattern (the closest match for openpowers active provider):**

Active (in-use) state:
```ts
{
  disabled: false,    // Note: cc-switch uses false; openpowers spec says disabled
  variant: "secondary",
  className: "bg-gray-200 text-muted-foreground hover:bg-gray-200 hover:text-muted-foreground dark:bg-gray-700 dark:hover:bg-gray-700",
  icon: <Check className="h-4 w-4" />,
  text: t("provider.inUse"),  // "已在用"
}
```

Inactive (enableable) state:
```ts
{
  disabled: false,
  variant: "default",
  className: "",  // Uses default primary button style (blue)
  icon: <Play className="h-4 w-4" />,
  text: t("provider.enable"),  // "启用"
}
```

**Standard (non-OMO) pattern** (lines 187-206):

Active (isCurrent) state:
```ts
{
  disabled: true,   // Greyed out, non-interactive
  variant: "secondary",
  className: "bg-gray-200 text-muted-foreground hover:bg-gray-200 hover:text-muted-foreground dark:bg-gray-700 dark:hover:bg-gray-700",
  icon: <Check className="h-4 w-4" />,
  text: t("provider.inUse"),
}
```

Inactive state:
```ts
{
  disabled: false,
  variant: "default",
  className: "",  // Default blue primary
  icon: <Play className="h-4 w-4" />,
  text: t("provider.enable"),
}
```

**Button rendering** (line 250-259):
```tsx
<Button
  size="sm"
  variant={buttonState.variant}
  onClick={handleMainButtonClick}
  disabled={buttonState.disabled}
  className={cn("w-[4.5rem] px-2.5", buttonState.className)}
>
  {buttonState.icon}
  {buttonState.text}
</Button>
```

---

#### 3. Props Data Flow (cc-switch ProviderList.tsx -> ProviderCard.tsx)

`ProviderListProps` interface (line 51-71) accepts `activeProviderId` as an optional prop:
```ts
interface ProviderListProps {
  activeProviderId?: string;
  // ...other props
}
```

It flows through `SortableProviderCard` (line 603) and into `ProviderCard` (line 61), which passes `isCurrent` to `ProviderActions` (line 513-514).

`ProviderCard` determines `isActiveProvider` based on multiple conditions (line 256-264):
```ts
const isActiveProvider = isAnyOmo
  ? isCurrent
  : appId === "openclaw"
    ? Boolean(isDefaultModel)
    : appId === "opencode"
      ? false
      : isAutoFailoverEnabled
        ? activeProviderId === provider.id
        : isCurrent;
```

---

### Current Project: openpowers Existing Patterns

#### 4. App.tsx State Patterns

Current state management uses `useState` + `useCallback`:
- `refreshTrigger` (number counter) triggers re-fetch in child components
- `triggerRefresh()` increments the counter
- Dialog states: `isAddDialogOpen`, `editingProvider`, `deletingProvider`
- `handleToggle` calls `PATCH /api/providers/${provider.id}/toggle` directly

Props passed to `ProviderList`:
```tsx
React.createElement(ProviderList, {
  onToggle: handleToggle,
  onEdit: handleOpenEditDialog,
  onDelete: handleOpenDeleteDialog,
  onAddProvider: handleOpenAddDialog,
  refreshTrigger,
})
```

**No `activeProviderId` or `onSetActive` is currently passed.**

#### 5. ProviderList.tsx Props and Data Flow

Current `ProviderListProps`:
```ts
interface ProviderListProps {
  onToggle: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProvider: () => void;
  refreshTrigger?: number;
}
```

Data fetching: `GET /api/providers` via `fetch()` in a `useCallback` + `useEffect` tied to `refreshTrigger`.

ProviderCard is rendered with:
```tsx
React.createElement(ProviderCard, {
  key: provider.id,
  provider,
  onToggle,
  onEdit,
  onDelete,
})
```

**No `activeProviderId` or `onSetActive` is currently passed to ProviderCard.**

#### 6. ProviderCard.tsx Current Button Implementation

Current toggle button (Power/PowerOff pattern, lines 134-149):
```tsx
// Toggle button
React.createElement(
  'button',
  {
    type: 'button',
    onClick: handleToggle,
    disabled: togglePending,
    'aria-label': `Toggle ${provider.name}`,
    className: `p-2 rounded-lg transition-colors ${
      provider.enabled
        ? 'text-yellow-600 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
        : 'text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40'
    }`,
  },
  React.createElement(provider.enabled ? Power : PowerOff, { size: 16 }),
),
```

Current imports include `Power, PowerOff` from lucide-react. The button only toggles enabled/disabled state, with no concept of "active provider".

#### 7. Server API Endpoints (Already Implemented)

The server already provides the required endpoints:

**GET /api/providers/active** (providers.ts, line 73-76):
```ts
providersRouter.get('/active', (_req, res) => {
  const activeProviderId = getActiveProviderId();
  res.status(200).json({ activeProviderId });
});
```

**PUT /api/providers/active** (providers.ts, line 83-95):
```ts
providersRouter.put('/active', (req, res) => {
  const parsed = SetActiveProviderSchema.safeParse(req.body);
  // ...validation...
  setActiveProviderId(parsed.data.providerId);
  res.status(200).json({ activeProviderId: parsed.data.providerId });
});
```

**Store functions** (providers-store.ts):
- `getActiveProviderId()`: reads from `active-provider.json`, returns `string | null`
- `setActiveProviderId(providerId)`: validates provider exists, writes to `active-provider.json`
- `clearActiveProviderId()`: writes null
- Cascade: `deleteProvider()` auto-clears active if the deleted provider was active

## Supplementary Exploration Results

Supplementary exploration was configured (websearch=true, context7=true) but not needed. The cc-switch reference repository and current project codebase provided sufficient information for understanding the active provider state management pattern and enable button design.
