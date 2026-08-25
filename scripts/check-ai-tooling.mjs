#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const root = resolve(rootArg >= 0 ? args[rootArg + 1] : process.cwd());
const wantDrift = args.includes('--drift');
const wantJson = args.includes('--json');
const openIssue = args.includes('--open-issue');

const errors = [];
const notes = [];

function read(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing ${rel}`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

function readJson(rel) {
  const raw = read(rel);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${rel}: invalid JSON (${error.message})`);
    return null;
  }
}

function mustInclude(rel, content, needle, label = needle) {
  if (content == null) return;
  if (!content.includes(needle)) errors.push(`${rel}: missing ${label}`);
}

function skillDirHasSkill(dir) {
  const skill = join(dir, 'SKILL.md');
  return existsSync(skill) && statSync(skill).isFile();
}

const graphifyRule = read('.cursor/rules/graphify.mdc');
mustInclude('.cursor/rules/graphify.mdc', graphifyRule, 'alwaysApply: true', 'alwaysApply');
mustInclude('.cursor/rules/graphify.mdc', graphifyRule, 'graphify query');
mustInclude('.cursor/rules/graphify.mdc', graphifyRule, 'graphify path');
mustInclude('.cursor/rules/graphify.mdc', graphifyRule, 'graphify explain');
mustInclude('.cursor/rules/graphify.mdc', graphifyRule, 'graphify update');

const specKitRule = read('.cursor/rules/spec-kit.mdc');
mustInclude('.cursor/rules/spec-kit.mdc', specKitRule, 'alwaysApply: true', 'alwaysApply');
mustInclude('.cursor/rules/spec-kit.mdc', specKitRule, 'specs/');
mustInclude('.cursor/rules/spec-kit.mdc', specKitRule, '.specify/memory/constitution.md');
mustInclude('.cursor/rules/spec-kit.mdc', specKitRule, 'governance.yaml');

const agents = read('AGENTS.md');
mustInclude('AGENTS.md', agents, 'graphify query');
mustInclude('AGENTS.md', agents, 'Spec Kit');
mustInclude('AGENTS.md', agents, 'graphify update');

const claude = read('CLAUDE.md');
mustInclude('CLAUDE.md', claude, 'AGENTS.md');
mustInclude('CLAUDE.md', claude, 'graphify query');

const hooksRaw = read('.cursor/hooks.json');
if (hooksRaw != null) {
  try {
    const hooks = JSON.parse(hooksRaw);
    const session = hooks?.hooks?.sessionStart;
    if (!Array.isArray(session) || session.length === 0) {
      errors.push('.cursor/hooks.json: missing sessionStart');
    } else {
      const command = session[0]?.command;
      if (!command) errors.push('.cursor/hooks.json: sessionStart missing command');
      else if (!existsSync(join(root, command))) errors.push(`missing hook script ${command}`);
    }
  } catch (error) {
    errors.push(`.cursor/hooks.json: invalid JSON (${error.message})`);
  }
}

const governance = readJson('governance.yaml');
const initOptions = readJson('.specify/init-options.json');
const integration = readJson('.specify/integration.json');
const pins = [
  governance?.spec_kit?.version,
  initOptions?.speckit_version,
  integration?.version,
].filter(Boolean);
const uniquePins = [...new Set(pins)];
if (uniquePins.length !== 1 || pins.length !== 3) {
  errors.push(`Spec Kit pin mismatch: governance=${governance?.spec_kit?.version ?? 'missing'} init-options=${initOptions?.speckit_version ?? 'missing'} integration=${integration?.version ?? 'missing'}`);
}

const agentsSkills = join(root, '.agents/skills');
const cursorSkills = join(root, '.cursor/skills');
if (!existsSync(agentsSkills)) {
  errors.push('missing .agents/skills');
} else {
  const speckitSkills = readdirSync(agentsSkills).filter((name) => name.startsWith('speckit-'));
  if (!speckitSkills.includes('speckit-specify')) errors.push('missing .agents/skills/speckit-specify');
  for (const name of speckitSkills) {
    const source = join(agentsSkills, name);
    const target = join(cursorSkills, name);
    if (!skillDirHasSkill(source)) errors.push(`missing ${join('.agents/skills', name, 'SKILL.md')}`);
    if (!existsSync(target) || !skillDirHasSkill(realpathSync(target))) {
      errors.push(`Cursor cannot see ${name} under .cursor/skills`);
    }
  }
}

if (!skillDirHasSkill(join(root, '.agents/skills/graphify'))) {
  errors.push('missing .agents/skills/graphify/SKILL.md');
}
if (!existsSync(join(cursorSkills, 'graphify')) || !skillDirHasSkill(realpathSync(join(cursorSkills, 'graphify')))) {
  errors.push('Cursor cannot see graphify under .cursor/skills');
}

const pin = uniquePins[0] ?? null;
if (!errors.length) {
  notes.push('AI tooling check passed');
  notes.push('graphify.mdc alwaysApply');
  notes.push('spec-kit.mdc alwaysApply');
  notes.push('speckit-specify visible');
  notes.push('sessionStart configured');
  notes.push(`pin=${pin}`);
}

async function latestRelease(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'qlmed-ai-tooling-check',
    },
  });
  if (!response.ok) {
    throw new Error(`${repo} HTTP ${response.status}`);
  }
  const body = await response.json();
  return String(body.tag_name ?? '').replace(/^v/, '');
}

function localGraphifyVersion() {
  const result = spawnSync('graphify', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const match = String(result.stdout || result.stderr).match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

function issueBody(report) {
  return [
    'Drift automático entre o que o QLMED pina/usa e o latest público.',
    '',
    '```json',
    JSON.stringify(report, null, 2),
    '```',
    '',
    'Pin do projeto Spec Kit **não** sobe sozinho (constituição e templates são customizados).',
    'Abra uma branch descartável, rode o upgrade da integração, preserve as customizações e valide com `npm run docs:validate`.',
    'CLI Graphify sobe no refresh diário do host; se o CLI local estiver atrás, a próxima janela do refresh deve alinhar.',
  ].join('\n');
}

function upsertIssue(report) {
  const title = `[ai-tooling-drift] Spec Kit ${report.spec_kit.pin}→${report.spec_kit.latest}; Graphify ${report.graphify.cli ?? 'missing'}→${report.graphify.latest}`;
  const listed = spawnSync(
    'gh',
    ['issue', 'list', '--search', '[ai-tooling-drift] in:title', '--state', 'open', '--json', 'number,title'],
    { encoding: 'utf8' },
  );
  if (listed.status !== 0) {
    throw new Error(listed.stderr || 'gh issue list failed');
  }
  const open = JSON.parse(listed.stdout || '[]');
  const existing = open[0];
  if (existing?.number) {
    const edited = spawnSync('gh', ['issue', 'edit', String(existing.number), '--title', title, '--body', issueBody(report)], {
      encoding: 'utf8',
    });
    if (edited.status !== 0) throw new Error(edited.stderr || 'gh issue edit failed');
    return { action: 'updated', number: existing.number };
  }
  const created = spawnSync('gh', ['issue', 'create', '--title', title, '--body', issueBody(report)], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'gh issue create failed');
  return { action: 'created', url: created.stdout.trim() };
}

const contract = {
  ok: errors.length === 0,
  errors,
  pin,
  root,
};

if (!wantDrift) {
  if (wantJson) console.log(JSON.stringify(contract, null, 2));
  else {
    if (errors.length) {
      console.error(`AI tooling check failed (${errors.length}):`);
      for (const error of errors) console.error(`- ${error}`);
    } else {
      for (const note of notes) console.log(note);
    }
  }
  process.exit(errors.length ? 1 : 0);
}

const drift = {
  ...contract,
  spec_kit: { pin, latest: null },
  graphify: { cli: localGraphifyVersion(), latest: null },
  has_drift: false,
};

try {
  drift.spec_kit.latest = await latestRelease('github/spec-kit');
  drift.graphify.latest = await latestRelease('Graphify-Labs/graphify');
} catch (error) {
  console.error(`drift lookup failed: ${error.message}`);
  process.exit(1);
}

drift.has_drift = Boolean(
  (drift.spec_kit.pin && drift.spec_kit.latest && drift.spec_kit.pin !== drift.spec_kit.latest)
  || (drift.graphify.latest && drift.graphify.cli && drift.graphify.cli !== drift.graphify.latest),
);

if (openIssue && drift.has_drift) {
  try {
    drift.issue = upsertIssue(drift);
  } catch (error) {
    console.error(`failed to open drift issue: ${error.message}`);
    process.exit(1);
  }
}

if (wantJson) console.log(JSON.stringify(drift, null, 2));
else {
  if (errors.length) {
    console.error(`AI tooling check failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
  } else {
    for (const note of notes) console.log(note);
  }
  console.log(`SPEC_KIT_PIN=${drift.spec_kit.pin ?? ''}`);
  console.log(`SPEC_KIT_LATEST=${drift.spec_kit.latest ?? ''}`);
  console.log(`GRAPHIFY_CLI=${drift.graphify.cli ?? 'missing'}`);
  console.log(`GRAPHIFY_LATEST=${drift.graphify.latest ?? ''}`);
  console.log(`DRIFT=${drift.has_drift ? 'yes' : 'no'}`);
}

process.exit(errors.length ? 1 : 0);
