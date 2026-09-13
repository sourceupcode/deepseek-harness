# Agent Note: Pack-time export completeness for the published dsh closure

Status: implemented

English | [中文](2026-09-13-pack-time-export-completeness.zh.md)

## Problem

The dsh release family publishes every non-experimental `packages/*/*` and `apps/*` member on one version from a `dsh-v*` tag. The existing pack-time payload check only rejects what a member must never publish — source files and declaration maps. It says nothing about what the member's manifest *promises*: an export target its `files` field leaves out publishes fine, and every consumer inside this repository stays healthy because a workspace link resolves the missing artifact's source through the package directory.

That invisibility is the defect for the first external consumers. A settings card built outside this repository — the first is `@sourceupcode/dsh-oidc`, whose browser half resolves its types and runtime through the published `dsh-client-ui-settings`, `dsh-client-ui-settings-plugins`, `dsh-client-store`, and `dsh-client-ui-slots` export maps — has no workspace link to fall back on. A closure member that publishes a dangling export target breaks every such consumer at their install, and the break is undiagnosable from this repository: the pack step succeeded, the tarball is a valid npm package, and nothing inside the repository ever resolves the dangling target.

## Decision

### The check

The dsh family's pack-time payload validation (`scripts/publication-payload.ts`, applied from `DshFamily.validatePayload`) now runs a second pass, `validateDeclaredExports`: every non-source export target the member's manifest declares — string root form, subpath strings, and condition-map entries — must be present among the tarball's members. Three exemptions keep the check honest to the publication policy it guards:

- **Source-only targets and subpaths** (`src` and `src/...`, including the `./src/*` wildcard subpaths the client manifests declare) are skipped: the payload never publishes `src/`, and those subpaths serve the workspace consumer that resolves through the package link.
- **`package.json`** is exempt because npm guarantees it in every payload.
- **Wildcard subpath entries** select no concrete target and are skipped rather than pattern-matched.

An unsupported `exports` form (an array condition, a non-string condition target) fails the pack with the entry named, rather than being interpreted silently.

### The closure

The guarantee is stated for the whole family rather than a card-need list: every dsh member's declared targets are checked, so the closure the external settings card consumes — `dsh-client-ui-slots`, `dsh-client-ui-settings` (the settings scope, the schema service, the slot contract), `dsh-client-store`, `dsh-client-ui-settings-plugins` (the `settings.plugin.item` slot type), and the card's existing closure of `dsh-client-connection`, `-locale`, `-ui-renderer`, `-ui-session`, `-ui-commands`, `-ui-conversation`, `-ui-primitives`, `-ui-dockkit` — is covered by membership in the family plus this check, and any future external consumer is covered by the same rule. No manifest in the current publish set needs to change for the check to pass; the rehearsal on a clean tree is the evidence.

The vendor family keeps its own payload policy: it publishes source and declaration maps by design, so the dsh closure check deliberately does not reach it.

## Alternatives considered

**A hardcoded closure allowlist in the release script.** A named list of the card's packages would guard only the known consumer and rot the moment a card needs a package it does not name today; a list is also a second source of truth for what the family publishes, which the family manifest patterns already own. The per-member check covers the same ground without the list.

**A registry-resolution check in CI (install the published versions from the registry and import their types).** That would verify the real consumer path end to end, but it needs publication credentials in the rehearsal and couples a local pack check to the registry's current state — exactly the coupling the family design removes between the three sequences. It would also run only after a publication, whereas the point of this check is to stop the publication. The local pack check decides before upload; the registry stays the ledger.

**A per-package `files` audit test.** A workspace-level test that every manifest's targets resolve on disk would duplicate the pack step's job on a different input (the checkout, not the assembled payload) and would pass for a member whose `files` glob is right but whose build output moved. The pack step is the single point where the published bytes exist; the check lives there.

## Consequences

A future restructure that drops a `files` entry or moves an artifact a manifest names now fails the dsh release rehearsal with the member and the missing target named, before the version reaches a registry — the failure the external card could not diagnose is the failure the release operator can. The cost is one membership lookup per declared target per member at pack, and the pack log the operator already reads.

The guarantee is scoped to declared targets: an artifact the manifest never names stays outside it, and a consumer that reaches a package by a path the manifest does not declare (a direct `node_modules` reach-in) is not one this rule protects. The vendor family's src-and-maps payloads are unchanged. The dsh-oidc card is the first consumer of the closure; its build against the published `0.1.5-rc.2` set is the standing proof that the guarantee matches a real consumer's needs.
