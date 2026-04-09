# Pulse CLI

Pulse is the compact vault CLI.

## Balance-style reads

Use stash inspection when you need current units:

```bash
pulse stash inspect --account alice
```

## Transfers

Create a move when you want to send units:

```bash
pulse move create --from alice --to bob --units 12 --memo rent
```

## Notes

- `pulse stash inspect` requires `--account`
- `pulse move create` requires `--from`, `--to`, and `--units`
- `--memo` is optional on transfers
