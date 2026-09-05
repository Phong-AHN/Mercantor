# Relay — Design system

The brief said the audience cares about the interface, so the UI is treated as a system rather
than as a set of pages that happen to look similar. Everything below lives in `packages/ui`.

---

## 1. The one rule

**Application code never writes a raw colour, and never re-decides how a status looks.**

It writes `bg-surface-1`, `text-muted`, `border-line`, and it renders a `Descriptor` that
`@relay/core` already decided:

```tsx
<StatusPill descriptor={ISSUE_SEVERITY_LABEL[issue.severity]} />
```

Those maps are total `Record<Status, Descriptor>`, so adding a status is a **compile error** until
somebody decides its label and its tone. That is what stops a new state quietly rendering grey and
unlabelled six months from now.

---

## 2. Tokens

`packages/ui/src/tokens.css`. The palette is OKLCH — perceptually even, so a "warning" and a
"danger" chip carry the same visual weight, and the dark theme is derived by moving lightness
rather than by hand-picking a second palette.

| Group    | Tokens                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Surfaces | `canvas`, `surface-1`, `surface-2`, `surface-3`, `line`, `line-strong`                                          |
| Text     | `ink`, `ink-soft`, `muted`, `faint`                                                                             |
| Semantic | `accent`, `success`, `warning`, `danger`, `info`, `neutral` — each with a `-soft` fill and an `-ink` foreground |
| Teams    | `team-ahn`, `team-shopline`, `team-merchant`, `team-other`                                                      |
| Shape    | `--radius-xs` … `--radius-2xl`, `shadow-card` / `raised` / `overlay`                                            |

The team colours are load-bearing: they are used **everywhere** a team is named — avatars, the
delay-ownership bar, blocker owners, next-step owners — so people learn "amber means the merchant"
without reading a legend.

### Theming

The theme lives in `data-theme` on `<html>`, not in a class, and an inline script in the root
layout resolves it before first paint so there is no flash.

> This is not cosmetic. React owns `<html>`'s `className` and rewrites it during hydration, which
> silently dropped a class the pre-paint script had added — the page flashed and then reverted to
> light. A data attribute React never renders is left alone. The script always resolves "system"
> to an explicit `light` or `dark`, so a single CSS selector covers every case.

---

## 3. Components

| Component                                                                                   | Note                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `IconButton`, `buttonStyles`                                                      | Six variants, four sizes. `buttonStyles` exists so an anchor can look like a button without nesting one inside the other. An icon-only button **requires** a label.                                         |
| `Card`, `CardHeader`, `CardBody`, `CardFooter`                                              | `CardHeader` takes `title`, `description`, `count`, `icon`, `actions` — the shape every panel in the product actually needs.                                                                                |
| `Badge`, `StatusPill`, `TeamChip`, `Mono`                                                   | `StatusPill` takes a `Descriptor`, never a colour. `Mono` is for identifiers you say out loud.                                                                                                              |
| `Stat`, `AnswerTile`, `DetailList`, `DetailRow`                                             | `AnswerTile` is the component the core product principle is written into: a question, its computed answer, and the fact behind it.                                                                          |
| `ProgressBar`, `SegmentedBar`, `TeamSplitBar`, `TargetMeter`                                | `TeamSplitBar` is the delay-ownership bar. `TargetMeter` turns the bar red when a dwell time passes its target, not just the label.                                                                         |
| `Avatar`, `AvatarStack`, `PersonCell`, `Unassigned`                                         | Initials tinted by team. No uploads: an avatar that always renders beats one that is usually a broken image.                                                                                                |
| `TableScroller`, `Table`, `THead`, `TH`, `TBody`, `TR`, `TD`                                | Primitives, not a data grid — the portfolio table needs bespoke cells. What is shared is the chrome: sticky header, hairline rows, and horizontal scroll that never spills onto the page.                   |
| `Loading`, `Skeleton`, `Empty`, `ErrorState`, `PermissionDenied`, `NotFoundState`           | Required states as components. A feature that ships without them is incomplete.                                                                                                                             |
| `Alert`, `BlockerBanner`                                                                    | `BlockerBanner` is the "current blocker must be prominent" requirement, made literal: it sits above everything, pulses, and names the owner and the elapsed time.                                           |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioCards`, `Fieldset`, `FormActions` | `Field` owns the label, the hint, the error and the required marker, so no form re-invents them.                                                                                                            |
| `PageHeader`, `Breadcrumbs`, `Tabs`, `Section`, `FilterPills`                               | Tabs and pills are real links — every sub-view stays addressable.                                                                                                                                           |
| `StageRail`, `Timeline`, `TimelineItem`                                                     | Seventeen steps is too many for a classic stepper, so the rail groups by phase, keeps every step, and puts dwell time under the ones that have one. Re-work shows as a visited step behind the current one. |
| `Dialog`, `ConfirmDialog`, `DialogTrigger`                                                  | Built on the native `<dialog>`: focus trapping, top layer, Esc, and an inert background come for free, and a hand-rolled overlay reliably gets them wrong.                                                  |
| `ToastProvider`, `useToast`                                                                 | Failures stay until dismissed; successes fade.                                                                                                                                                              |

---

## 4. Interaction rules

- **Filters and tabs write to the URL.** A filtered board is a link somebody can paste into
  Slack, and everyone opens the same thing.
- **The status control _is_ the status.** Access and asset states are a row of pills you click,
  not a dropdown behind an edit form. The options a given reader may set are decided on the
  server and passed in.
- **One hook behind every mutation.** `useAction` owns the pending flag, the field errors the
  server returned, the toast and the refresh. No form re-implements them, and every form fails
  the same way.
- **Errors land where they were caused.** `defineAction` returns field errors keyed by field, and
  `Field` renders them under the input.
- **Nothing is destructive without a sentence.** Moving a project backwards, closing an issue,
  requesting changes and resolving a blocker all require written reasons — that is what makes the
  timeline explain itself later.

---

## 5. Accessibility

Semantic HTML, labelled controls, visible focus rings that are never removed, `aria-current` on
active navigation and stage steps, live regions for toasts, a skip link, and real mobile
navigation rather than a menu that is merely hidden below `lg`. Wide content scrolls inside its
own container so the page body never scrolls sideways. `prefers-reduced-motion` disables every
animation.

---

## 6. Adding a screen

1. Read through a scoped query in `features/*/queries.ts` — never `db` directly from a page.
2. Compose from `@relay/ui`. If a primitive is missing, add it to the package rather than
   inventing it locally; that is how the previous project drifted.
3. Render a `Descriptor` for every status. If the map does not have the case, add it there.
4. Include the empty, error and permission-denied states before calling the screen done.
5. Check both themes and a narrow viewport. `node scripts/shot.mjs` takes the screenshots.
