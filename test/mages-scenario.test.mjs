import assert from 'node:assert/strict';
import test from 'node:test';
import { magesScenarioHandler } from '../src/adapters/freemote/handlers/mages-scenario.mjs';

const SLOTS = {
  source: 0, reference: 1, destination: 1, protectedFrom: 'destination',
};
const CONTEXT = { archive: 'story', file: 'ch01.scn.m.json', resource: {}, slots: SLOTS };

// texts[N] is [speaker, languages, ...]; a narration row carries an empty speaker.
function document() {
  return {
    name: 'ch01.ks',
    scenes: [
      {
        texts: [
          ['少年', [[null, 'なんだって！？', 16], ['少年', '"What now!?"', 16]]],
          ['', [[null, '窓の外はもう暗くなっていた。', 16], [null, 'It was already dark outside the window.', 16]]],
          ['少女', [[null, 'ふわわーい', 16], ['少女', '"Fuwawai!"', 16]]],
        ],
      },
    ],
  };
}

test('a dialogue segment carries its speaker in context', () => {
  const segments = magesScenarioHandler.segments(document(), CONTEXT);
  const line = segments.find((s) => s.id === 'ch01.ks#s0:t0');
  assert.equal(line.context.speaker, '少年');
  assert.deepEqual(line.context, {
    archive: 'story', file: 'ch01.ks', scene: 0, text: 0, speaker: '少年',
  });
  assert.equal(segments.find((s) => s.id === 'ch01.ks#s0:t2').context.speaker, '少女');
});

// Absence means the line carries no new speaker header. Callers still have to read it in
// context: outside a threaded scene that means narration, inside one it means the previous
// poster is still talking.
test('a line with no speaker header carries no speaker key at all, rather than an empty one', () => {
  const narration = magesScenarioHandler.segments(document(), CONTEXT)
    .find((s) => s.id === 'ch01.ks#s0:t1');
  assert.ok(!('speaker' in narration.context), 'an empty header must not become an empty speaker');
  assert.deepEqual(narration.context, {
    archive: 'story', file: 'ch01.ks', scene: 0, text: 1,
  });
});

test('the speaker does not disturb the fields a build depends on', () => {
  const [line] = magesScenarioHandler.segments(document(), CONTEXT);
  assert.equal(line.source, 'なんだって！？');
  assert.equal(line.reference, '"What now!?"');
  assert.equal(line.protectedTokenSource, 'reference');
  assert.equal(line.protectedTokenProfile, 'mages');
  line.write('뭐라고!?');
  assert.equal(line.id, 'ch01.ks#s0:t0');
});
