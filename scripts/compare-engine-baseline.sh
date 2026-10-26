#!/usr/bin/env bash
# Compare the exact same benchmark harness using main's original C++ engine
# and the optimized engine built in Release mode by CI. Read-only to main.
set -euo pipefail

cd "$(dirname "$0")/.."
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
mkdir -p "$temp_dir/include" "$temp_dir/src"

git fetch --no-tags --depth=1 origin main >/dev/null

for file in Models.hpp ReactionGraph.hpp Trie.hpp; do
  git show "FETCH_HEAD:engine/include/$file" > "$temp_dir/include/$file"
done
for file in ReactionGraph.cpp Trie.cpp; do
  git show "FETCH_HEAD:engine/src/$file" > "$temp_dir/src/$file"
done

c++ -std=c++17 -O3 -DNDEBUG \
  -I"$temp_dir/include" \
  "$temp_dir/src/ReactionGraph.cpp" "$temp_dir/src/Trie.cpp" \
  engine/bench/benchmark_engine.cpp \
  -o "$temp_dir/baseline_bench"

echo "=== BASELINE: origin/main C++ implementation ==="
"$temp_dir/baseline_bench" data/compounds.csv data/reactions.csv 384

echo "=== OPTIMIZED: pull request C++ implementation ==="
engine/build-release/chempath_bench data/compounds.csv data/reactions.csv 384

echo "NOTE: Timings vary with runner load; compare repeated runs on the same hardware."
