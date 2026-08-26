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
          ['倫太郎', [[null, 'なんだと！？', 16], ['倫太郎', '"What!?"', 16]]],
          ['', [[null, '右耳に当てているケータイ電話。', 16], [null, 'The phone against my right ear.', 16]]],
          ['まゆり', [[null, 'トゥットゥルー', 16], ['まゆり', '"Tuturu!"', 16]]],
        ],
      },
    ],
  };
}

test('a dialogue segment carries its speaker in context', () => {
  const segments = magesScenarioHandler.segments(document(), CONTEXT);
  const line = segments.find((s) => s.id === 'ch01.ks#s0:t0');
  assert.equal(line.context.speaker, '倫太郎');
  assert.deepEqual(line.context, {
    archive: 'story', file: 'ch01.ks', scene: 0, text: 0, speaker: '倫太郎',
  });
  assert.equal(segments.find((s) => s.id === 'ch01.ks#s0:t2').context.speaker, 'まゆり');
});

test('narration carries no speaker key at all, rather than an empty one', () => {
  const narration = magesScenarioHandler.segments(document(), CONTEXT)
    .find((s) => s.id === 'ch01.ks#s0:t1');
  assert.ok(!('speaker' in narration.context), 'absence is the signal that nobody is speaking');
  assert.deepEqual(narration.context, {
    archive: 'story', file: 'ch01.ks', scene: 0, text: 1,
  });
});

test('the speaker does not disturb the fields a build depends on', () => {
  const [line] = magesScenarioHandler.segments(document(), CONTEXT);
  assert.equal(line.source, 'なんだと！？');
  assert.equal(line.reference, '"What!?"');
  assert.equal(line.protectedTokenSource, 'reference');
  assert.equal(line.protectedTokenProfile, 'mages');
  line.write('뭐라고!?');
  assert.equal(line.id, 'ch01.ks#s0:t0');
});
