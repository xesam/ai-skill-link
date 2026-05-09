#!/usr/bin/env bash
# Test suite for skill-link multi-repository functionality
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Setup test environment
setup() {
    info "Setting up test environment..."

    # Create test repos
    mkdir -p /tmp/skill-link-test/{repo1,repo2}

    # Create test skills in repo1
    mkdir -p /tmp/skill-link-test/repo1/skill-a
    echo "---
name: skill-a
---
Test skill A" > /tmp/skill-link-test/repo1/skill-a/SKILL.md

    mkdir -p /tmp/skill-link-test/repo1/skill-b
    echo "---
name: skill-b
---
Test skill B" > /tmp/skill-link-test/repo1/skill-b/SKILL.md

    # Create test skills in repo2
    mkdir -p /tmp/skill-link-test/repo2/skill-c
    echo "---
name: skill-c
---
Test skill C" > /tmp/skill-link-test/repo2/skill-c/SKILL.md

    # Create duplicate skill in repo2
    mkdir -p /tmp/skill-link-test/repo2/skill-a
    echo "---
name: skill-a-v2
---
Test skill A version 2" > /tmp/skill-link-test/repo2/skill-a/SKILL.md

    # Create test config
    cat > skill-link.local.conf <<'EOF'
[repo]
test1 = /tmp/skill-link-test/repo1
test2 = /tmp/skill-link-test/repo2

[clis]
test-cli = /tmp/skill-link-test/target
EOF

    mkdir -p /tmp/skill-link-test/target
    info "Test environment ready"
}

# Cleanup test environment
cleanup() {
    info "Cleaning up test environment..."
    rm -rf /tmp/skill-link-test
    rm -f skill-link.local.conf
    info "Cleanup complete"
}

# Test: --list shows all repos
test_list_all_repos() {
    local output
    output=$(./skill-link --list 2>&1)

    if echo "$output" | grep -q "\[test1\]" && \
       echo "$output" | grep -q "\[test2\]" && \
       echo "$output" | grep -q "skill-a" && \
       echo "$output" | grep -q "skill-c"; then
        pass "list shows all repos"
    else
        fail "list shows all repos (output: $output)"
    fi
}

# Test: --list --repo shows specific repo
test_list_specific_repo() {
    local output
    output=$(./skill-link --list --repo test1 2>&1)

    if echo "$output" | grep -q "skill-a" && \
       echo "$output" | grep -q "skill-b" && \
       ! echo "$output" | grep -q "skill-c"; then
        pass "list --repo test1 shows only test1"
    else
        fail "list --repo test1 shows only test1 (output: $output)"
    fi
}

# Test: manual skill auto-searches all repos
test_manual_skill_search() {
    local output
    output=$(./skill-link skill-c --cli test-cli --dry-run 2>&1)

    if echo "$output" | grep -q "repo2/skill-c"; then
        pass "manual skill searches all repos"
    else
        fail "manual skill searches all repos (output: $output)"
    fi
}

# Test: --all processes all repos
test_all_repos() {
    local output
    output=$(./skill-link --all --cli test-cli --dry-run 2>&1)

    if echo "$output" | grep -q "skill-a" && \
       echo "$output" | grep -q "skill-b" && \
       echo "$output" | grep -q "skill-c"; then
        pass "--all processes all repos"
    else
        fail "--all processes all repos (output: $output)"
    fi
}

# Test: --all --repo processes specific repo
test_all_specific_repo() {
    local output
    output=$(./skill-link --all --repo test2 --cli test-cli --dry-run 2>&1)

    if echo "$output" | grep -q "skill-c" && \
       ! echo "$output" | grep -q "skill-b"; then
        pass "--all --repo test2 processes only test2"
    else
        fail "--all --repo test2 processes only test2 (output: $output)"
    fi
}

# Test: duplicate skill names are deduplicated
test_duplicate_dedup() {
    local output
    output=$(./skill-link --all --cli test-cli --dry-run 2>&1)
    local count
    count=$(echo "$output" | grep -c "skill-a" || true)

    if [[ "$count" -eq 1 ]]; then
        pass "duplicate skills are deduplicated"
    else
        fail "duplicate skills are deduplicated (found $count occurrences)"
    fi
}

# Test: non-existent repo error
test_invalid_repo() {
    local output
    output=$(./skill-link --list --repo non-existent 2>&1 || true)

    if echo "$output" | grep -q "does not exist"; then
        pass "invalid repo shows error"
    else
        fail "invalid repo shows error (output: $output)"
    fi
}

# Main test execution
main() {
    echo "================================"
    echo "Skill-Link Multi-Repo Test Suite"
    echo "================================"
    echo

    setup
    echo

    test_list_all_repos
    test_list_specific_repo
    test_manual_skill_search
    test_all_repos
    test_all_specific_repo
    test_duplicate_dedup
    test_invalid_repo

    echo
    cleanup

    echo
    echo "================================"
    echo "Test Results"
    echo "================================"
    echo -e "${GREEN}Passed: $PASSED${NC}"
    if [[ "$FAILED" -gt 0 ]]; then
        echo -e "${RED}Failed: $FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

main "$@"
