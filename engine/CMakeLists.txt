cmake_minimum_required(VERSION 3.16)
project(ChemPathEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(chempath_core
    src/CSRGraph.cpp
    src/ReactionGraph.cpp
    src/Lab.cpp
    src/Trie.cpp
    src/ReactionDependencyGraph.cpp
)

target_include_directories(chempath_core PUBLIC include)

if(MSVC)
    target_compile_options(chempath_core PRIVATE /W4)
else()
    target_compile_options(chempath_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(chempath src/main.cpp)
target_link_libraries(chempath PRIVATE chempath_core)

enable_testing()

# Reproducible in-memory algorithm benchmark (no process or CSV startup time).
add_executable(chempath_bench bench/benchmark_engine.cpp)
target_link_libraries(chempath_bench PRIVATE chempath_core)

add_executable(chempath_tests tests/test_engine.cpp)
target_link_libraries(chempath_tests PRIVATE chempath_core)

add_test(
    NAME chempath_engine_tests
    COMMAND chempath_tests
        ${CMAKE_CURRENT_SOURCE_DIR}/../data/compounds.csv
        ${CMAKE_CURRENT_SOURCE_DIR}/../data/reactions.csv
)

# Separate dependency-closure tests; does not change the legacy graph tests.
add_executable(chempath_dependency_tests tests/test_reaction_dependencies.cpp)
target_link_libraries(chempath_dependency_tests PRIVATE chempath_core)
add_test(NAME reaction_dependency_tests COMMAND chempath_dependency_tests)

# Differential validation of the production CSR and adjacency-list backends.
add_executable(chempath_csr_tests tests/test_csr_production.cpp)
target_link_libraries(chempath_csr_tests PRIVATE chempath_core)
add_test(NAME csr_production_tests COMMAND chempath_csr_tests
    ${CMAKE_CURRENT_SOURCE_DIR}/../data/compounds.csv
    ${CMAKE_CURRENT_SOURCE_DIR}/../data/reactions.csv)
