import { protectedTokenSource } from './slots.mjs';

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
        // The speaker sits beside the language array. Without it in context a translator
        // cannot tell dialogue from narration, and a character voice guide is unusable.
        const speaker = typeof text?.[0] === 'string' && text[0].length > 0 ? text[0] : undefined;
        segments.push({
          id,
          source,
          reference,
          protectedTokenSource: protectedFrom,
          protectedTokenProfile: resource.protectedTokenProfile ?? 'mages',
          context: {
            archive,
            file: document.name,
            scene: sceneIndex,
            text: textIndex,
            // Absent whenever the line carries no new speaker header. That is narration in
            // an ordinary scene, but a threaded scene — a message board read on screen —
            // uses the header for the poster and leaves continuation lines bare, so absence
            // there means "same poster as above" instead.
            ...(speaker === undefined ? {} : { speaker }),
          },
          write(target) { languages[slots.destination][1] = target; },
        });
      });
    });
    return segments;
  },
};
