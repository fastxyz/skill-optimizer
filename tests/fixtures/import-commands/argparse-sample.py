import argparse

parser = argparse.ArgumentParser(description='CLI tool')
subparsers = parser.add_subparsers(dest='command')

create_parser = subparsers.add_parser('create', help='Create a new item')
create_parser.add_argument('--name', help='Item name')
create_parser.add_argument('--count', type=int, help='Count')

list_parser = subparsers.add_parser('list', help='List all items')
list_parser.add_argument('--limit', type=int, help='Max results')

args = parser.parse_args()
