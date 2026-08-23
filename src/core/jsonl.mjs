import fs from 'node:fs';
import path from 'node:path';

export function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${file}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }
  return rows;
}

export function writeJsonLines(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const content = rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '';
  fs.writeFileSync(file, content, 'utf8');
}

export function listJsonLines(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  };
  visit(root);
  return files.sort();
}
