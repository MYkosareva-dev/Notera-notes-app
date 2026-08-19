// The tag chip's shared appearance, in one place (CLAUDE.md rule 11 — import
// constants, never redeclare them).
//
// WHY THIS FILE EXISTS. A tag chip is drawn in three places — the card preview, the
// editor's row, and the filter — and through the Phase 6 gate each one carried its own
// hand-written class string. They had already drifted: SPEC Block E claimed "the same
// chip shape in all three places" while the filter's idle chip was neutral rather than
// accent-tinted, which is the divergence rule 18 exists to catch. Three copies of one
// visual element is exactly the case rule 11 names.
//
// It is a constants module, not a component: SPEC Block E's component table is closed
// (the Toast row treats it that way), so a `TagChip` component would be scope this
// phase has no sanction for. Class strings have no such problem — this sits beside
// lib/copy.ts and lib/routes.ts as another thing every caller imports rather than
// retypes. Nothing here renders, and nothing here is server-only: client and server
// components both import it.
//
// What is deliberately NOT shared is size. The card is a dense preview and its chips
// are smaller than the editor's on purpose; the editor's are padded asymmetrically to
// sit against their × button. Each caller adds its own padding and text size, and only
// the parts that must agree live here.

/**
 * Geometry every tag chip agrees on, whatever its size or colour.
 *
 * `max-w-full truncate` is the load-bearing half: a 24-character tag (`LIMITS.tagMax`)
 * must clip rather than widen the 224 px filter column or push a card grid sideways.
 * Every caller that uses this must therefore also give the chip a `title`, or the
 * clipped text becomes unreadable with no affordance to recover it.
 */
export const TAG_CHIP_SHAPE = "max-w-full truncate rounded-full font-medium";

/**
 * A STATIC chip — the card preview and the editor's row. Accent tint on the palette's
 * palest indigo, which is the whole of SPEC Block E's Phase 6 decision: no new hue
 * enters the palette for tags, and no colour is derived from the tag's text.
 *
 * `TagFilter`'s chips are deliberately not this: they are links with a selected state,
 * so their idle form is neutral and only the selected one takes solid accent. An
 * accent-tinted idle chip beside an accent-filled selected chip reads as two selected
 * states. That file composes TAG_CHIP_SHAPE with its own two-state palette.
 */
export const TAG_CHIP = `${TAG_CHIP_SHAPE} bg-accent-soft text-accent`;
