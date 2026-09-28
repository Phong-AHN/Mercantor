# UI/UX Improvement Instructions

## 1. Objective

Improve the existing application's UI/UX so that it is:

* More intuitive for users.
* Easier to navigate.
* Easier to understand.
* Less visually overwhelming.
* More consistent across screens.
* More efficient for frequent users.
* More professional and polished.
* Responsive across desktop, tablet, and mobile.
* Accessible.
* Consistent with the existing product and brand.

The goal is **not simply to make the interface prettier**.

The primary goal is to improve the user's ability to understand the information, complete tasks, and know what to do next.

---

# 2. Important Rules

## Do NOT rebuild the application from scratch

The existing application already contains:

* Business logic.
* Existing pages.
* Existing components.
* Existing design patterns.
* Existing API integrations.
* Existing permissions.
* Existing workflows.

Preserve them.

Do not rewrite working functionality unless there is a strong technical or UX reason.

---

## Do NOT change business logic unnecessarily

UI/UX improvements must not accidentally change:

* Data behavior.
* API contracts.
* Authentication.
* Authorization.
* User permissions.
* Database behavior.
* Existing workflows.
* Status transitions.
* Validation rules.
* Payment behavior.
* External integrations.

If a UX improvement requires a business-logic change, clearly explain it before making the change.

---

# 3. Design Philosophy

This is a professional B2B SaaS application.

The interface should feel:

* Clear.
* Calm.
* Trustworthy.
* Modern.
* Efficient.
* Professional.
* Easy to scan.
* Information-dense without feeling cluttered.

Do NOT make it look like a marketing landing page.

Avoid unnecessary:

* Gradients.
* Decorative animations.
* Excessive shadows.
* Excessive rounded cards.
* Huge typography.
* Excessive whitespace.
* Decorative illustrations.
* Floating UI that does not serve a purpose.
* Animations that slow down workflows.

Visual design must support usability.

---

# 4. Use the Existing Design System

Before creating or modifying UI:

1. Inspect the existing component library.
2. Inspect existing styles.
3. Inspect typography.
4. Inspect colors.
5. Inspect spacing rules.
6. Inspect buttons.
7. Inspect inputs.
8. Inspect tables.
9. Inspect cards.
10. Inspect dialogs/modals.
11. Inspect navigation.
12. Inspect existing responsive behavior.

Reuse existing components whenever possible.

Do NOT create a new component if an existing component already solves the same problem.

If the existing design system is inconsistent, improve the underlying component rather than creating multiple one-off variations.

---

# 5. Use Frontend Design Skill

If the `frontend-design` skill is available, use it for UI/UX work.

Before implementing major visual changes:

* Read the frontend-design skill.
* Inspect the current UI.
* Understand the product context.
* Establish a coherent visual direction.
* Apply the visual direction consistently.

Do not blindly follow generic AI-generated UI patterns.

---

# 6. OpenUI

OpenUI is NOT required for ordinary application screens.

Do not introduce OpenUI simply because it is available.

Use the existing React/application architecture for normal:

* Dashboards.
* Tables.
* Forms.
* Filters.
* Detail pages.
* Settings.
* Reports.
* Admin screens.
* CRUD interfaces.

OpenUI may only be introduced when there is a genuine requirement for:

* Generative UI.
* Dynamically generated interfaces.
* LLM-generated UI.
* AI-driven conversational interfaces.

Do not replace the existing design system with OpenUI merely for visual redesign.

---

# 7. Required Workflow

For every significant UI/UX improvement, follow this process.

## Step 1 — Inspect

Before changing code, inspect:

* Relevant page.
* Related components.
* Existing styles.
* Existing data flow.
* Existing interactions.
* Existing responsive behavior.
* Existing loading/error/empty states.

Understand how the screen works before modifying it.

---

## Step 2 — Understand the User

Identify:

* Who uses this screen?
* What is the user's primary goal?
* What information do they need first?
* What action should they take?
* What information is secondary?
* What information can be hidden until needed?
* What could confuse a first-time user?
* What could slow down an experienced user?

Do not optimize the UI based only on visual appearance.

---

# 8. UX Audit

Before implementation, evaluate the screen against the following categories.

## 8.1 Information Hierarchy

Ask:

* Is the most important information immediately visible?
* Can users understand the page within a few seconds?
* Are primary actions obvious?
* Are secondary actions visually less prominent?
* Are related pieces of information grouped together?
* Is low-priority information taking too much visual space?

---

## 8.2 Navigation

Check:

* Is it obvious where the user currently is?
* Is navigation predictable?
* Are related pages grouped together?
* Are breadcrumbs useful?
* Can users easily return to the previous context?
* Are important pages unnecessarily deep?

---

## 8.3 Labels and Language

Check:

* Are labels understandable?
* Are technical terms exposed unnecessarily?
* Are buttons action-oriented?
* Are status names clear?
* Are error messages understandable?

Prefer:

`Resolve finding`

over:

`Submit`

Prefer:

`Add page`

over:

`Create`

when that better describes the actual action.

---

# 9. Cognitive Load

Reduce unnecessary mental effort.

Avoid presenting too many equally important elements at once.

Use:

* Progressive disclosure.
* Grouping.
* Tabs when appropriate.
* Expandable sections.
* Clear hierarchy.
* Useful defaults.
* Contextual actions.

Do not hide important information simply to make the UI look cleaner.

The goal is to make complexity understandable, not to hide complexity.

---

# 10. CTA Hierarchy

Every important screen should have a clear action hierarchy.

Use:

### Primary action

The most important action.

Example:

`Create project`

### Secondary actions

Useful but less important actions.

Example:

`Export`
`Edit`
`Share`

### Destructive actions

Make them visually distinct and require appropriate confirmation.

Example:

`Delete`
`Remove`
`Dismiss`

Avoid having multiple visually identical primary buttons competing for attention.

---

# 11. Tables

Tables are important in this application.

Prioritize:

* Scannability.
* Consistent column alignment.
* Meaningful column ordering.
* Appropriate column widths.
* Useful sorting.
* Useful filtering.
* Pagination when necessary.
* Row actions.
* Clear status indicators.
* Responsive behavior.

Do not display every available field simply because the data exists.

Prioritize the information users actually need.

For secondary information, consider:

* Row expansion.
* Detail drawer.
* Detail page.
* Tooltip.
* Secondary metadata.

---

# 12. Filters

Filters should help users answer questions quickly.

Avoid creating a wall of controls.

Group related filters.

Example:

Primary filters:

* Status.
* Severity.
* Assignee.

Secondary filters:

* Date.
* Category.
* Client visibility.

If many filters exist, consider:

* Filter button.
* Filter popover.
* Saved filters.
* Clear-all action.
* Active filter chips.

Always make it obvious which filters are currently active.

---

# 13. Forms

Forms should minimize friction.

Follow:

* Logical field grouping.
* Clear labels.
* Helpful descriptions.
* Sensible defaults.
* Inline validation.
* Clear required/optional indicators.
* Clear submit action.
* Clear cancellation behavior.

Do not make users remember information unnecessarily.

If a value can be inferred safely, consider providing it automatically.

---

# 14. Empty States

Every major data screen should have a useful empty state.

Do NOT simply display:

`No data`

Instead explain:

1. What is missing.
2. Why the user is seeing an empty state.
3. What they can do next.

Example:

> No QA findings yet.
> Run a page check to automatically identify common issues.

Then provide:

`Check page`

when appropriate.

---

# 15. Loading States

Avoid blank screens while loading.

Use:

* Skeletons.
* Loading indicators.
* Progressive loading.
* Disabled states where appropriate.

Loading states should preserve the layout whenever possible.

Avoid large layout shifts.

---

# 16. Error States

Errors must explain:

* What went wrong.
* Whether the user's data was affected.
* What they can do next.

Avoid technical messages such as:

`500 Internal Server Error`

when a user-friendly explanation can be provided.

For example:

> We couldn't check this page right now.
> The page may be temporarily unavailable. Try again in a moment.

Provide a recovery action where appropriate.

---

# 17. Success States

After important actions, clearly communicate completion.

Examples:

* Finding resolved.
* Page added.
* Project created.
* Changes saved.
* Client notified.

Do not make users wonder whether their action succeeded.

---

# 18. Destructive Actions

For destructive actions:

* Make the action visually distinct.
* Explain the consequence.
* Require confirmation when appropriate.
* Avoid ambiguous button labels.

Prefer:

`Delete project`

over:

`Confirm`

The confirmation dialog should clearly explain what will happen.

---

# 19. Status Design

Status should be understandable at a glance.

Use:

* Consistent colors.
* Consistent labels.
* Consistent icons where useful.
* Consistent placement.

Do not rely only on color.

For accessibility, status should also communicate meaning through:

* Text.
* Icons.
* Labels.

---

# 20. Accessibility

Every UI improvement must consider accessibility.

Check:

* Keyboard navigation.
* Focus states.
* Color contrast.
* Button labels.
* Form labels.
* Screen-reader semantics.
* Interactive element sizes.
* Error messaging.
* Non-color indicators.

Do not use color as the only way to communicate state.

---

# 21. Responsive Design

Every improved screen must work at:

### Desktop

`1440px`

### Tablet

`768px`

### Mobile

`390px`

Do not simply shrink the desktop layout.

Consider what information should:

* Stack.
* Collapse.
* Move into a drawer.
* Become horizontally scrollable.
* Become secondary.
* Be hidden behind progressive disclosure.

Tables require particular attention on mobile.

---

# 22. Visual Consistency

Maintain consistency across:

* Typography.
* Spacing.
* Buttons.
* Inputs.
* Cards.
* Tables.
* Badges.
* Icons.
* Modals.
* Navigation.
* Empty states.
* Loading states.
* Error states.

If the same concept appears in multiple places, it should look and behave consistently.

---

# 23. Spacing

Avoid random spacing values.

Prefer the existing spacing system.

If the project does not have a consistent spacing system, establish a small predictable scale and use it consistently.

Do not fix spacing independently on every page.

---

# 24. Typography

Typography should create hierarchy.

Use a clear distinction between:

* Page title.
* Section title.
* Card title.
* Body text.
* Supporting text.
* Metadata.
* Labels.

Avoid making everything bold.

Avoid using too many font sizes.

---

# 25. Color

Use color intentionally.

Color should communicate:

* Importance.
* Status.
* Interaction.
* Errors.
* Warnings.
* Success.

Do not use many colors simply to make the interface look more interesting.

---

# 26. Icons

Use icons to improve recognition, not decoration.

Do not:

* Add icons to every label.
* Use ambiguous icons.
* Replace understandable text with icons unnecessarily.

Interactive icon-only buttons must have accessible labels/tooltips.

---

# 27. Interaction Design

For every important interaction, consider:

* Default state.
* Hover state.
* Focus state.
* Active state.
* Disabled state.
* Loading state.
* Success state.
* Error state.

Do not implement only the happy path.

---

# 28. Microcopy

Improve wording where it reduces confusion.

Buttons should describe actions.

Bad:

`Submit`

Better:

`Save changes`

Bad:

`Action`

Better:

`Assign finding`

Bad:

`Continue`

Better:

`Publish to client`

Use concise, human-readable language.

---

# 29. Visual References

When screenshots are provided:

1. Analyze the screenshot carefully.
2. Identify:

   * Layout.
   * Hierarchy.
   * Spacing.
   * Typography.
   * Component relationships.
   * Navigation.
   * Visual density.
   * Interaction patterns.
3. Recreate the useful design principles.
4. Do not blindly copy visual details that conflict with the existing application.

If the screenshot represents the desired design direction, use it as a strong reference.

---

# 30. Do Not Guess When Visual Inspection Is Possible

If the application can be run locally:

1. Start the application.
2. Open the relevant page.
3. Inspect the actual rendered UI.
4. Test interactions.
5. Test responsive layouts.
6. Capture screenshots where possible.
7. Review the result.
8. Fix visual problems.
9. Review again.

Do not assume that a successful build means the UI is correct.

---

# 31. Screenshot Review Loop

For significant UI work, use this loop:

```text
Existing UI
    ↓
Inspect
    ↓
UX Audit
    ↓
Design proposal
    ↓
Implementation
    ↓
Run application
    ↓
Rendered UI
    ↓
Screenshot
    ↓
Visual review
    ↓
Fix
    ↓
Screenshot again
```

Do not stop after the first implementation.

---

# 32. Prioritization

Classify UX problems:

## P0 — Critical

Problems that:

* Prevent users from completing tasks.
* Cause serious confusion.
* Hide important information.
* Cause destructive mistakes.
* Break accessibility.

Fix first.

## P1 — High

Problems that:

* Make common workflows unnecessarily difficult.
* Create significant cognitive load.
* Cause users to miss important information.
* Require unnecessary clicks.

Fix next.

## P2 — Medium

Problems involving:

* Inconsistency.
* Visual hierarchy.
* Spacing.
* Component polish.
* Minor usability improvements.

## P3 — Polish

Examples:

* Small animations.
* Minor visual refinements.
* Decorative improvements.

Do these last.

---

# 33. Required Implementation Process

For a significant redesign:

### Phase 1 — Audit

Do not modify code.

Provide:

* Current UX problems.
* Current UI problems.
* User-flow problems.
* Accessibility problems.
* Responsive problems.

### Phase 2 — Proposal

Provide:

* Proposed changes.
* Reason for each change.
* Priority: P0/P1/P2/P3.
* Expected user benefit.

Do not implement large changes before this stage.

### Phase 3 — Implementation

Implement the approved/high-confidence improvements.

Preserve:

* Existing functionality.
* Existing API behavior.
* Existing data model.
* Existing permissions.
* Existing design system.

### Phase 4 — Verification

Run:

* Typecheck.
* Lint.
* Tests.
* Production build.

Then inspect the actual UI.

### Phase 5 — Visual QA

Check:

* Desktop.
* Tablet.
* Mobile.
* Loading.
* Empty.
* Error.
* Success.
* Disabled.
* Hover.
* Focus.

### Phase 6 — Final UX Review

Ask:

> If I were a new user, would I immediately understand what this page is for?

> Would I know what to do next?

> Can I find the important information quickly?

> Can I complete the primary task with minimal unnecessary effort?

> Is anything visually competing for attention unnecessarily?

> Is there anything confusing that the code alone would not reveal?

Fix remaining issues.

---

# 34. Important Constraint

Do not optimize the UI for screenshots alone.

A visually impressive screenshot is not enough.

The final interface must work well for real users performing real tasks.

Prioritize:

**Usability > Clarity > Consistency > Accessibility > Visual polish**

Do not sacrifice usability for visual aesthetics.

---

# 35. Final Requirement

When asked to improve an existing UI, do NOT immediately start coding.

First:

1. Inspect.
2. Understand the workflow.
3. Audit the UX.
4. Identify the highest-impact problems.
5. Propose improvements.
6. Implement them.
7. Run the application.
8. Inspect the rendered UI.
9. Test responsive behavior.
10. Review again.
11. Fix remaining issues.

The expected result is not merely:

> "The code works."

The expected result is:

> "The user can understand the interface quickly, navigate it confidently, and complete their task efficiently."
