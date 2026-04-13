import { Command } from 'commander';

const program = new Command();

program
  .command('create')
  .description('Create a new item')
  .option('--name <value>', 'Item name')
  .option('--dry-run', 'Preview only')
  .action(() => {});

program
  .command('delete <id>')
  .description('Delete an item by ID')
  .action(() => {});

program
  .command('list')
  .description('List all items')
  .option('--limit <n>', 'Max results')
  .action(() => {});

program.parse(process.argv);
