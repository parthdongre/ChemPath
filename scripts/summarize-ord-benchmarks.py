#!/usr/bin/env python3
"""Validate and summarize reproducible ORD eager/lazy/cold benchmark runs.

Input directory layout: ROOT/<nodes>/{manifest.json,eager.csv,lazy.csv,cold.csv}
Output: Markdown and JSON with correctness checks, timing and process RSS.
Synthetic fixture values are NOT real-world chemistry metrics.
"""
from __future__ import annotations
import argparse
import csv
import json
import math
from pathlib import Path
import platform
import statistics
import os
import subprocess


def load_csv(path: Path):
    metadata = {}
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            name, _, value = line[2:].partition("=")
            metadata[name] = value.strip()
        elif line:
            lines.append(line)
    records = list(csv.DictReader(lines))
    if not records:
        raise ValueError(f"No benchmark records in {path}")
    return metadata, records


def summarize(records):
    latencies = sorted(float(row["latency_ms"]) for row in records)
    return {
        "samples": len(records),
        "p50_ms": round(latencies[math.ceil(0.50 * len(latencies)) - 1], 4),
        "p95_ms": round(latencies[math.ceil(0.95 * len(latencies)) - 1], 4),
        "mean_ms": round(statistics.mean(latencies), 4),
        "mean_sql_queries": round(statistics.mean(int(r["sqlite_queries"]) for r in records), 2),
        "mean_cache_hits": round(statistics.mean(int(r["cache_hits"]) for r in records), 2),
        "incomplete": sum(r["complete"] != "1" for r in records),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sizes", type=int, nargs="+", default=[900, 3000, 9000])
    args = parser.parse_args()

    cpu_model = platform.processor() or platform.machine()
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        for line in cpuinfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("model name") and ":" in line:
                cpu_model = line.partition(":")[2].strip()
                break
    try:
        compiler = subprocess.run(["c++", "--version"], capture_output=True, text=True,
                                  check=True).stdout.splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        compiler = "unknown"
    evidence = {
        "environment": {
            "operatingSystem": platform.platform(),
            "cpu": cpu_model,
            "compiler": compiler,
            "build": "Release - use engine/build-release/chempath_ord_bench",
            "gitCommit": os.environ.get("GITHUB_SHA", "local"),
            "python": platform.python_version(),
            "source": "deterministic synthetic ORD-shaped SQLite graph (not chemistry)",
        },
        "groups": [],
        "allExactResultsAgree": True,
    }
    markdown = [
        "# ChemPath — Milestone C benchmark evidence",
        "",
        "Source: reproducible synthetic ORD-shaped SQLite fixture, **not real chemical "
        "reactions**. All algorithms compare the **same query pairs** in separate "
        "processes. The eager graph is constructed fully in memory; lazy uses "
        "a persistent SQLite connection with bounded LRU; cold creates a fresh "
        "read-only connection per query.",
        "",
        "The timings are observations from this CI runner, not guaranteed future "
        "latencies. Setup time excludes per-query work; cold mode includes "
        "opening SQLite for every query. RSS is full process peak and therefore "
        "includes the runtime, SQLite and test harness, not only graph arrays.",
        "",
        f'**Environment:** {cpu_model}; {compiler}; Release build; '
        f'commit {os.environ.get("GITHUB_SHA", "local")[:12]}.',
        "",
        "| Vertices | Directed links | Mode | Setup ms | p50 ms | p95 ms | Mean ms | Peak RSS KiB | Mean SQL queries | Incomplete |",
        "|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for nodes in args.sizes:
        directory = args.input_dir / str(nodes)
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        modes = {}
        by_key = {}
        for mode in ("eager", "lazy", "cold"):
            metadata, records = load_csv(directory / f"{mode}.csv")
            metrics = summarize(records)
            metrics["setup_ms"] = round(float(metadata["initialization_ms"]), 4)
            metrics["peak_rss_kib"] = int(metadata.get("peak_rss_kib", "0"))
            by_key[mode] = {
                (r["round"], r["source"], r["target"]):
                    (r["found"], r["complete"], r["hops"])
                for r in records
            }
            modes[mode] = metrics
            markdown.append(
                f'| {nodes:,} | {manifest["participationLinks"]:,} | {mode} '
                f'| {metrics["setup_ms"]:.3f} | {metrics["p50_ms"]:.3f} '
                f'| {metrics["p95_ms"]:.3f} | {metrics["mean_ms"]:.3f} '
                f'| {metrics["peak_rss_kib"]:,} | {metrics["mean_sql_queries"]:.2f} '
                f'| {metrics["incomplete"]} |'
            )
        if set(by_key["eager"]) != set(by_key["lazy"]) or \
           set(by_key["eager"]) != set(by_key["cold"]):
            raise ValueError(f"Source-target queries differ across modes for n={nodes}")
        mismatches = []
        for key, eager in by_key["eager"].items():
            if eager[1] != "1":
                raise ValueError("Unexpected incomplete eager reference result")
            for mode in ("lazy", "cold"):
                observed = by_key[mode][key]
                if observed[1] != "1" or eager != observed:
                    mismatches.append({"query": key, "mode": mode, "reference": eager,
                                       "observed": observed})
        if mismatches:
            evidence["allExactResultsAgree"] = False
        evidence["groups"].append({
            "dataset": manifest,
            "modes": modes,
            "mismatchCount": len(mismatches),
            "mismatches": mismatches[:10],
        })
        markdown.append("")
        markdown.append(
            f"**{nodes:,}-vertex correctness:** "
            f'{"PASS" if not mismatches else "FAIL"} — '
            f'{len(by_key["eager"])} matched exact reference query results; '
            f'{len(mismatches)} discrepancies.'
        )
        markdown.append("")
    markdown.extend([
        "## Interpretation",
        "",
        "These synthetic graph benchmarks demonstrate indexed access, query "
        "completeness and measured memory/latency behavior under controlled "
        "conditions. They do **not** prove that the largest Open Reaction "
        "Database snapshot was searched end-to-end, nor that any returned path "
        "represents a feasible laboratory synthesis.",
        "",
        "If memory differences are small, note that the eager fixture graph "
        "may be too small relative to common process overhead. Increase the "
        "fixture size for a stronger external-memory comparison; never "
        "invent an unmeasured speedup.",
        "",
    ])
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "milestone-c-benchmarks.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (args.out / "milestone-c-benchmarks.md").write_text(
        "\n".join(markdown), encoding="utf-8")
    print("\n".join(markdown))
    if not evidence["allExactResultsAgree"]:
        raise SystemExit("Indexed ORD results diverged from eager reference")


if __name__ == "__main__":
    main()
