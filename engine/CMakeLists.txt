cmake_minimum_required(VERSION 3.16)
project(ChemPathEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(chempath_core
    src/ReactionGraph.cpp
    src/Trie.cpp
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

add_executable(chempath_tests tests/test_engine.cpp)
target_link_libraries(chempath_tests PRIVATE chempath_core)

add_test(
    NAME chempath_engine_tests
    COMMAND chempath_tests
        ${CMAKE_CURRENT_SOURCE_DIR}/../data/compounds.csv
        ${CMAKE_CURRENT_SOURCE_DIR}/../data/reactions.csv
)
