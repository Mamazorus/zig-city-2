---
name: dev-web
description: Generalist frontend development standards for this project. Use whenever writing, editing, reviewing, or refactoring web code (React, TypeScript, HTML, CSS, JavaScript) or any user-facing UI copy. Enforces component reuse over duplication, strict TypeScript, project-existing conventions, basic accessibility, and code/copy that reads as human-written rather than AI-generated.
---

# Web development standards

These are the working conventions for this codebase. Apply them on every coding task without being asked. When a rule here conflicts with an explicit instruction from the developer, the developer wins. When it conflicts with an existing project convention, the project convention wins (see "Respect what already exists").

## 0. Respect what already exists (do this first)

Before writing anything, look at the project:

- Read `tsconfig.json`, `.eslintrc*`, `.prettierrc*`, `package.json` and follow them. Do not fight the configured rules, formatter, or style.
- Match the existing folder structure, file naming, and import style. If components live in `src/components/` with `PascalCase.tsx`, keep doing that. Do not invent a new convention.
- Match the existing patterns for state, data fetching, routing, and styling. If the project uses a given approach, extend it instead of introducing a parallel one.
- Do not add a new dependency, UI kit, styling solution, or state library if one already covers the need. Justify any new dependency before adding it.

## 1. Reuse components, never re-create

This is the most important rule of the project.

- Before building any UI element, search the codebase for an existing component, hook, or utility that already does it (Button, Input, Modal, Card, layout primitives, formatting helpers, etc.). Reuse it.
- If something is close but not identical, extend it through props/variants or composition rather than copy-pasting a near-duplicate.
- Factor repeated markup into a component instead of repeating JSX.
- Keep shared logic in hooks/utils, not duplicated across files.
- Only create a new component when nothing suitable exists, and place it where similar components already live.

## 2. TypeScript

- Write in strict mode. Avoid `any`. If a type is genuinely unknown, use `unknown` and narrow it, not `any`.
  - *Why:* `any` silently disables type checking for that value and lets bugs through. `unknown` forces you to check the shape before using it, so the compiler keeps protecting you.
- Type props with an explicit `interface` or `type`. Type function returns when not obvious.
- Reuse existing types/interfaces instead of redefining the same shape. Keep shared types in their existing location.
- Prefer precise unions and literal types over loose `string`/`number` when the set of values is known.
- No `@ts-ignore` / `@ts-expect-error` to paper over a real type problem; fix the type.

## 3. React

- Functional components with hooks only.
- Prefer composition over duplication and over deep prop drilling.
- Keep components focused; split when one is doing too much.
- Stable, correct hook dependencies; do not disable the exhaustive-deps lint rule to hide a bug.
- Lists need stable keys (not the array index when items can reorder).
- Keep side effects in `useEffect`/event handlers, not in render.
- Reuse design tokens (colors, spacing, typography, breakpoints) from the project's theme/variables. Do not hardcode magic values when a token exists.

## 4. Accessibility (baseline, always)

- Use semantic HTML: `button` for actions, `a` for navigation, headings in order, `nav`/`main`/`header`/`footer` where they apply. Do not use a `div` with an onClick where a `button` belongs.
- Every image has a meaningful `alt` (empty `alt=""` for purely decorative ones).
- Every form control has an associated `label`.
- Interactive elements are keyboard reachable and operable.
- Respect color contrast; do not ship text that fails basic contrast.

## 5. Write code and copy that reads as human-written

The goal is that nobody can tell an AI assisted. Avoid the common tells.

### Punctuation
- Do not use the em dash `—` or en dash `–` as a habitual writing tic to join clauses in sentences or UI copy. This is a strong AI tell. Default to commas, parentheses, or a full stop.
- They are acceptable where they are genuinely the right typographic choice: titles, headings, ranges (e.g. `9h–17h`, `2020–2024`). Use them deliberately, not by reflex.
- Never use letter-spacing / tracking adjustments on text. No `letter-spacing` in CSS, no tracking-* utilities, unless the developer explicitly asks for it.

### UI copy and prose
- Ban marketing buzzwords and filler in both English and French: "seamless", "unlock", "elevate", "dive in", "in a world where", "effortless", "game-changing", "supercharge", "robust", "leverage", and the French equivalents "élevez", "plongez", "dans un monde où", "n'hésitez pas à", "découvrez", "boostez", "sans effort". Write plainly and specifically.
- Avoid the formulaic "It's not just X, it's Y" / "Ce n'est pas seulement X, c'est Y" construction.
- Avoid the reflexive rule-of-three ("fast, simple, and powerful") and over-balanced hedging.
- No "In conclusion" / "In summary" / "Overall" wrap-ups in UI text.
- Do not Title Case Every Word in headings unless the project already does; follow the project's existing casing.

### Emojis
- No emoji spam, in UI copy, code comments, or commit messages. Only use an emoji if the project clearly already uses them in that context.

### Comments
- Keep comments minimal and useful. Comment the *why*, never restate the *what*.
- Delete redundant comments like `// loop through items` or `// set the state`. If the code is clear, no comment.
- No decorative comment banners or section dividers unless the file already uses them.

### No AI fingerprints
- Never add "Generated by AI", "Created with Claude", "AI-assisted", or similar notes in code, comments, file headers, or commit messages.
- Commit messages match the repo's existing style and language (look at `git log`). No emoji, no AI mention.

## 6. Scope discipline

- Build what was asked, not a speculative framework around it. No premature abstractions, no unused options "just in case".
- Do not add boilerplate, config, or files that were not requested.
- Do not reformat or rewrite unrelated code in the same change.
- If something genuinely should be done beyond the request, mention it instead of silently doing it.

## Quick checklist before finishing

- [ ] Reused existing components/hooks/utils instead of recreating them
- [ ] No `any`; props and returns typed; existing types reused
- [ ] Followed project structure, naming, lint/prettier/tsconfig
- [ ] Semantic HTML, `alt`, labels, keyboard access
- [ ] No `—`/`–` as a writing tic, no letter-spacing
- [ ] No buzzwords, no emoji spam, no redundant comments
- [ ] No AI mention anywhere; commit style matches the repo
- [ ] Nothing built beyond what was asked
