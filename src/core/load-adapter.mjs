import demoJson from '../adapters/demo-json.mjs';
import freeMoteInfoPsb from '../adapters/freemote-info-psb.mjs';

const adapters = new Map([
  [demoJson.id, demoJson],
  [freeMoteInfoPsb.id, freeMoteInfoPsb],
]);

export function listAdapters() {
  return [...adapters.values()].map(({ id, description, stability }) => ({ id, description, stability }));
}

export function loadAdapter(id) {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`unknown adapter: ${id}`);
  return adapter;
}
