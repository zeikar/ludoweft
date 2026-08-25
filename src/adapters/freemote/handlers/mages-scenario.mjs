function protectedTokenSource(slots) {
  if (slots.protectedFrom === 'source' || slots.protectedFrom === 'reference') return slots.protectedFrom;
  if (slots.protectedFrom !== 'destination') {
    throw new Error('languageSlots.protectedFrom must be source, reference, or destination');
  }
  if (slots.destination === slots.source) return 'source';
  if (slots.destination === slots.reference) return 'reference';
  throw new Error('destination-based protected tokens require destination to match source or reference slot');
}

export const magesScenarioHandler = {
  id: 'mages-scenario',

  translationName(document, { file, resource }) {
    const name = typeof document.name === 'string' && document.name.length > 0
      ? document.name
      : file.slice(0, resource.jsonSuffix ? -resource.jsonSuffix.length : -'.json'.length);
    return `${name}.jsonl`;
  },

  rawName(document, { file, resource }) {
    return typeof document.name === 'string' && document.name.length > 0
      ? document.name
      : file.slice(0, resource.jsonSuffix ? -resource.jsonSuffix.length : -'.json'.length);
  },

  segments(document, { archive, file, resource, slots }) {
    if (!Array.isArray(document.scenes)) return [];
    const protectedFrom = protectedTokenSource(slots);
    const segments = [];
    document.scenes.forEach((scene, sceneIndex) => {
      if (!Array.isArray(scene?.texts)) return;
      scene.texts.forEach((text, textIndex) => {
        const languages = text?.[1];
        if (!Array.isArray(languages)) return;
        const source = languages?.[slots.source]?.[1];
        const reference = languages?.[slots.reference]?.[1];
        const destination = languages?.[slots.destination]?.[1];
        // Partially localized/system-only rows are not translation segments. This mirrors
        // the original exporter and avoids inventing an absent destination language slot.
        if (typeof source !== 'string' || typeof reference !== 'string' || typeof destination !== 'string') return;
        if (typeof document.name !== 'string' || document.name.length === 0) {
          throw new Error(`${file}: document.name is required when translatable scenario text exists`);
        }
        const id = `${document.name}#s${sceneIndex}:t${textIndex}`;
        segments.push({
          id,
          source,
          reference,
          protectedTokenSource: protectedFrom,
          protectedTokenProfile: resource.protectedTokenProfile ?? 'mages',
          context: { archive, file: document.name, scene: sceneIndex, text: textIndex },
          write(target) { languages[slots.destination][1] = target; },
        });
      });
    });
    return segments;
  },
};
