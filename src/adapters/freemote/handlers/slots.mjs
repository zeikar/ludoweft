// Shared by every FreeMote handler: which language slot the protected tokens are read from.
// A project that writes its target into the reference slot must compare tokens against that
// slot's text, not against the source language the translator is reading.
export function protectedTokenSource(slots) {
  if (slots.protectedFrom === 'source' || slots.protectedFrom === 'reference') return slots.protectedFrom;
  if (slots.protectedFrom !== 'destination') {
    throw new Error('languageSlots.protectedFrom must be source, reference, or destination');
  }
  if (slots.destination === slots.source) return 'source';
  if (slots.destination === slots.reference) return 'reference';
  throw new Error('destination-based protected tokens require destination to match source or reference slot');
}
