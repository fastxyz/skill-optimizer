#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === 'stash' && args[1] === 'inspect') {
  const account = readFlag(args, '--account');
  console.log(JSON.stringify({ accountId: account, balance: account === 'alice' ? 125 : 40 }));
  process.exit(0);
}

if (args[0] === 'move' && args[1] === 'create') {
  const from = readFlag(args, '--from');
  const to = readFlag(args, '--to');
  const units = Number(readFlag(args, '--units'));
  const memo = readOptionalFlag(args, '--memo') ?? '';
  console.log(JSON.stringify({ accepted: units > 0, from, to, units, memo }));
  process.exit(0);
}

console.error('Unknown command');
process.exit(1);

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required flag ${name}`);
  }
  return args[index + 1];
}

function readOptionalFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
