# Melograph repository guidance

Read [README.md](README.md) when changing public behavior, installation, or the artifact contract. Keep user documentation there rather than caching it here.

## Invariants

- Preserve the continuous contour as primary evidence. Note events and Strudel are editable interpretations of it.
- Keep Praat autocorrelation as the production and web default. Treat pYIN as an optional CLI comparison until a listening benchmark justifies its latency and memory cost.
- Keep browser recordings ephemeral: analysis may hold audio in memory for playback, while the Vercel function remains stateless.
- Keep the Python artifact schema and the TypeScript `AnalysisResult` aligned when changing fields across the web seam.
- Re-run the named pilot listening surface in [docs/pilot-benchmark.md](docs/pilot-benchmark.md) for tracker, segmentation, repair, or synthesis changes; numeric diagnostics alone do not establish musical quality.

## Gates

- Python or CLI changes: `uv run pytest -q` and `uvx ruff check .`.
- Web changes: `npm --prefix web test` and `npm --prefix web run build`.
- Cross-seam changes pass both gates and a real capture/playback smoke test before deployment.
