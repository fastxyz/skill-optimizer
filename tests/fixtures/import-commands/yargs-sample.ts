import yargs from 'yargs';

yargs
  .command(
    'create',
    'Create a new item',
    (y) => y
      .option('name', { describe: 'Item name', type: 'string' })
      .option('verbose', { describe: 'Verbose output', type: 'boolean' }),
    (_argv) => {},
  )
  .command(
    'delete <id>',
    'Delete an item',
    (y) => y.positional('id', { describe: 'Item ID', type: 'string' }),
    (_argv) => {},
  )
  .parse();
