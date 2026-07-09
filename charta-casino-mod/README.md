# Charta Casino Addon

A reference addon for [Charta](https://github.com/lucaargolo/charta) that adds **Blackjack** and **Texas Hold'em** as standalone card games for both Fabric and NeoForge.

## Games

- **Blackjack**: betting, hit, stand, double down, dealer autoplay, and table-side chip tracking.
- **Texas Hold'em**: blinds, betting rounds, side pots, all-in support, showdown evaluation, and 3D chip stacks rendered on the card table.

## Requirements

- Minecraft 1.21.1
- Java 21
- Charta 1.2.1
- Fabric Loader 0.17.3+ with Fabric API 0.116.7+1.21.1, or NeoForge 21.1.212+

## Building

```bash
./gradlew build
```

Artifacts are written to:

- `fabric/build/libs/`
- `neoforge/build/libs/`

## Charta Addons

See `ADDON_GUIDE.md` for a loader-aware walkthrough of how to structure a Charta addon with the current API.

## License

MPL-2.0
