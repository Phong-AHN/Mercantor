# Relay — Roles & permissions

Deny by default. A role holds exactly what the matrix lists and nothing more. Roles are read from
Postgres on every request — never from a cookie, a header or a token claim.

---

## 1. Roles

| Role                            | Team     | Intent                                                                    |
| ------------------------------- | -------- | ------------------------------------------------------------------------- |
| **Platform Admin**              | AHN      | Operates the portal itself. Full reach, every action audited.             |
| **AHN Admin**                   | AHN      | Runs delivery. Everything, including money, users and settings.           |
| **AHN Project Manager**         | AHN      | Owns projects end to end: delivery, money, handoff, introductions.        |
| **AHN Developer**               | AHN      | Builds and tests. No commercial detail.                                   |
| **SHOPLINE Admin**              | SHOPLINE | Partner operations. Status, money, assignment, settings, audit.           |
| **SHOPLINE Account Manager**    | SHOPLINE | Owns the merchant relationship, the introduction and deployment sign-off. |
| **SHOPLINE Solutions Engineer** | SHOPLINE | The technical counterpart. Same visibility, without invoices.             |
| **Merchant**                    | MERCHANT | Their own migration only, on a separate surface.                          |

---

## 2. The matrix

**Legend** — ✅ full · 🟡 scoped or limited · 👁 read-only · ❌ none

| Area                       | Plat. Admin | AHN Admin | AHN PM | AHN Dev | SL Admin | SL AM | SL SE | Merchant |
| -------------------------- | :---------: | :-------: | :----: | :-----: | :------: | :---: | :---: | :------: |
| Portfolio dashboard        |     ✅      |    ✅     |   ✅   |   ✅    |    ✅    |  ✅   |  ✅   |    ❌    |
| Project read               |     ✅      |    ✅     |   ✅   |   ✅    |    ✅    |  ✅   |  ✅   |  🟡 own  |
| Project create             |     ✅      |    ✅     |   ✅   |   ❌    |    ✅    |  ✅   |  ✅   |    ❌    |
| Advance stage              |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Assign people              |     ✅      |    ✅     |   ✅   |   ❌    |    ✅    |  ✅   |  ❌   |    ❌    |
| Blockers — manage          |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Scope — manage             |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Access — verify            |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Access — provide           |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ✅    |
| Assets — approve           |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Assets — upload            |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ✅    |
| **AHN internal notes**     |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Comments — post            |     ✅      |    ✅     |   ✅   |   ✅    |    ✅    |  ✅   |  ✅   |    ✅    |
| Issues — manage            |     ✅      |    ✅     |   ✅   |   ✅    |    ✅    |  ❌   |  ✅   |    ❌    |
| **Invoices — read**        |     ✅      |    ✅     |   ✅   |   ❌    |    ✅    |  ✅   |  ❌   |    ❌    |
| Invoices — manage          |     ✅      |    ✅     |   ✅   |   ❌    |    ❌    |  ❌   |  ❌   |    ❌    |
| Design / Dev / QA sign-off |     ✅      |    ✅     |   ✅   |   ✅    |    ❌    |  ❌   |  ❌   |    ❌    |
| Merchant final approval    |     ✅      |    ✅     |   ✅   |   ❌    |    ❌    |  ❌   |  ❌   |    ✅    |
| Deployment approval        |     ✅      |    ❌     |   ❌   |   ❌    |    ✅    |  ✅   |  ✅   |    ❌    |
| Submit to SHOPLINE         |     ✅      |    ✅     |   ✅   |   ❌    |    ❌    |  ❌   |  ❌   |    ❌    |
| Decide a handoff           |     ✅      |    ❌     |   ❌   |   ❌    |    ✅    |  ✅   |  ✅   |    ❌    |
| Send introduction          |     ✅      |    ✅     |   ✅   |   ❌    |    ✅    |  ✅   |  ✅   |    ❌    |
| People directory           |     ✅      |    ✅     |   👁    |    👁    |    ✅    |   👁   |   👁   |    ❌    |
| Integrations               |     ✅      |    ✅     |   ✅   |    👁    |    ✅    |   👁   |   👁   |    ❌    |
| Portal settings            |     ✅      |    ✅     |   ❌   |   ❌    |    ✅    |  ❌   |  ❌   |    ❌    |
| Audit log                  |     ✅      |    ✅     |   ✅   |   ❌    |    ✅    |  ❌   |  ❌   |    ❌    |

The matrix lives in `packages/rbac/src/matrix.ts` and is the only source of it. `/people` renders
the highlights of each role's grant so it can be checked without reading code.

---

## 3. Rules that hold without exception

1. **Deny by default.** No grant, no access.
2. **Roles come from the database, on every request.** `resolveSession` re-reads the user row and
   rebuilds the principal; the role in the row is authoritative even over the denormalised `team`
   column, so a stale team cannot widen access.
3. **A deactivated user holds nothing.** `can()` returns false for every permission the moment
   `isActive` is false.
4. **The two surfaces refuse each other.** `(app)/layout.tsx` redirects a merchant principal to
   `/portal`; `(portal)/portal/layout.tsx` redirects everyone else to `/dashboard`. Guessing a URL
   lands you on your own surface, not on a narrowed version of somebody else's.
5. **A merchant is confined to their own projects** by `projectScopeWhere`, applied in the query.
   A project they are not a member of does not exist as far as any read is concerned.
6. **Approvals are one-sided.** `canDecideApproval` routes each checkpoint to the side that owns
   it. SHOPLINE cannot approve QA; AHN cannot approve deployment.
7. **The frontend uses the engine to hide controls; the server uses it to decide.** A hidden
   button is a courtesy. Every action asserts its permission again server-side.

---

## 4. How private notes stay private

The requirement is "internal AHN notes must remain private". It is implemented as a property of
the query, not of the page:

```ts
const visibilities = readableVisibilities(principal);
db.comment.findMany({ where: { projectId, visibility: { in: visibilities } } });
```

| Principal | Can read                                   | Can write  |
| --------- | ------------------------------------------ | ---------- |
| AHN       | `INTERNAL_AHN`, `AHN_SHOPLINE`, `EVERYONE` | all three  |
| SHOPLINE  | `AHN_SHOPLINE`, `EVERYONE`                 | those two  |
| Merchant  | `EVERYONE`                                 | `EVERYONE` |

A note somebody cannot read is never fetched, so it cannot leak through a serialisation mistake,
a client component or an error page. Writing above your level is refused server-side, and an
`INTERNAL_AHN` note is never sent to Slack no matter what the composer's checkbox says.

`scripts/e2e-smoke.mjs` proves all three directions in a real browser on every run.

---

## 5. Open questions

- **O1** — Should an AHN project manager be able to record the _merchant's_ final approval on
  their behalf? Currently yes: approvals arrive by email and on calls, and refusing to record them
  means the portal stops being the record. The row keeps who decided and who recorded it apart.
- **O2** — Should a SHOPLINE solutions engineer see invoices? Currently no. They are the technical
  counterpart, and the account manager owns the commercial relationship.
- **O3** — Should merchants see the blockers that are theirs? Currently they see them on the
  portal overview as "things that need you", but not the blocker record itself. That felt like the
  right level; confirm it with a real merchant.
