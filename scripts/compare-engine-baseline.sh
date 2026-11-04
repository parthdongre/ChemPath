#!/usr/bin/env bash
# Compare the same benchmark harness against the original pre-Milestone-A
# engine. Pin the baseline: comparing with moving 'main' becomes invalid
# as soon as upgraded milestones are merged. Read-only to all branches.
set -euo pipefail

cd "$(dirname "$0")/.."
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
mkdir -p "$temp_dir/include" "$temp_dir/src"

# Last verified pre-upgrade main commit; captured as PR #21 base SHA.
BASELINE_REV="177b56cb9afcb8d879b6ce7b63dc12073fcfd2a8"
git fetch --no-tags --depth=1 origin "$BASELINE_REV" >/dev/null

for file in Models.hpp ReactionGraph.hpp Trie.hpp; do
  git show "$BASELINE_REV:engine/include/$file" > "$temp_dir/include/$file"
done
for file in ReactionGraph.cpp Trie.cpp; do
  git show "$BASELINE_REV:engine/src/$file" > "$temp_dir/src/$file"
done

c++ -std=c++17 -O3 -DNDEBUG \
  -I"$temp_dir/include" \
  "$temp_dir/src/ReactionGraph.cpp" "$temp_dir/src/Trie.cpp" \
  engine/bench/benchmark_engine.cpp \
  -o "$temp_dir/baseline_bench"

echo "=== BASELINE: pinned pre-Milestone-A original C++ implementation ==="
"$temp_dir/baseline_bench" data/compounds.csv data/reactions.csv 384

echo "=== OPTIMIZED: pull request C++ implementation ==="
engine/build-release/chempath_bench data/compounds.csv data/reactions.csv 384

echo "Baseline commit: $BASELINE_REV"
echo "NOTE: Timings vary with runner load; compare repeated runs on the same hardware."
