import click

@click.group()
def cli():
    """CLI app."""
    pass

@cli.command()
@click.option('--name', help='Item name')
@click.option('--verbose', is_flag=True, help='Verbose output')
def create(name, verbose):
    """Create a new item."""
    pass

@cli.command()
@click.argument('item_id')
@click.option('--force', is_flag=True, help='Skip confirmation')
def delete(item_id, force):
    """Delete an item."""
    pass

if __name__ == '__main__':
    cli()
