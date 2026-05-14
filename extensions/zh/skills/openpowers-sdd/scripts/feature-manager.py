#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Feature List Manager - Manage features with topological dependency ordering.

Usage:
    python feature-manager.py next <plan.json>           # Get next feature to work on
    python feature-manager.py start <plan.json> <id>     # Mark feature as in_progress
    python feature-manager.py complete <plan.json> <id>  # Mark feature as done
    python feature-manager.py status <plan.json>         # Show overall status
    python feature-manager.py blocked <plan.json>        # List blocked features
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Set, Optional


def load_plan(plan_path: str) -> List[Dict]:
    """Load feature list from JSON file."""
    with open(plan_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_plan(plan_path: str, features: List[Dict]):
    """Save feature list back to JSON file."""
    with open(plan_path, 'w', encoding='utf-8') as f:
        json.dump(features, f, indent=2, ensure_ascii=False)


def get_feature_by_id(features: List[Dict], feature_id: str) -> Optional[Dict]:
    """Find feature by ID."""
    for feature in features:
        if feature['id'] == feature_id:
            return feature
    return None


def get_dependencies_satisfied(feature: Dict, features: List[Dict]) -> bool:
    """Check if all dependencies of a feature are completed."""
    for dep_id in feature.get('dependencies', []):
        dep_feature = get_feature_by_id(features, dep_id)
        if not dep_feature:
            print(f"Warning:Warning: Dependency '{dep_id}' not found", file=sys.stderr)
            return False
        if dep_feature['status'] != 'done':
            return False
    return True


def detect_cycles(features: List[Dict]) -> List[str]:
    """Detect circular dependencies using DFS."""
    # Build adjacency list
    graph = {f['id']: f.get('dependencies', []) for f in features}

    visited = set()
    rec_stack = set()
    cycles = []

    def dfs(node: str, path: List[str]):
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                cycle = dfs(neighbor, path)
                if cycle:
                    return cycle
            elif neighbor in rec_stack:
                # Found cycle
                cycle_start = path.index(neighbor)
                return path[cycle_start:] + [neighbor]

        path.pop()
        rec_stack.remove(node)
        return None

    for feature in features:
        if feature['id'] not in visited:
            cycle = dfs(feature['id'], [])
            if cycle:
                cycles.append(" ->".join(cycle))

    return cycles


def get_next_feature(features: List[Dict]) -> Optional[Dict]:
    """
    Get the next feature to work on.

    Priority:
    1. Status is 'pending'
    2. All dependencies are 'done'
    3. First in topological order (array order in JSON)
    """
    # Check for cycles first
    cycles = detect_cycles(features)
    if cycles:
        print("Error:Circular dependencies detected:", file=sys.stderr)
        for cycle in cycles:
            print(f"  {cycle}", file=sys.stderr)
        sys.exit(1)

    # Find first pending feature with satisfied dependencies
    for feature in features:
        if feature['status'] == 'pending':
            if get_dependencies_satisfied(feature, features):
                return feature

    return None


def cmd_next(plan_path: str):
    """Get next feature to work on."""
    features = load_plan(plan_path)
    next_feature = get_next_feature(features)

    if not next_feature:
        print("No more features to work on (all pending features have unmet dependencies)")
        return

    print(f"Next feature: {next_feature['id']}")
    print(f"  Category: {next_feature['category']}")
    print(f"  Function: {next_feature['function']}")
    print(f"  Description: {next_feature['description']}")
    print(f"\nAcceptance Criteria:")
    for i, criterion in enumerate(next_feature['acceptance_criteria'], 1):
        print(f"  {i}. {criterion}")

    if next_feature.get('dependencies'):
        print(f"\nDependencies: {', '.join(next_feature['dependencies'])}")

    print(f"\nFiles:")
    for file in next_feature['files']:
        print(f"  - {file}")


def cmd_start(plan_path: str, feature_id: str):
    """Mark feature as in_progress."""
    features = load_plan(plan_path)
    feature = get_feature_by_id(features, feature_id)

    if not feature:
        print(f"Error:Feature '{feature_id}' not found", file=sys.stderr)
        sys.exit(1)

    if feature['status'] != 'pending':
        print(f"Error:Feature '{feature_id}' is not pending (current: {feature['status']})", file=sys.stderr)
        sys.exit(1)

    if not get_dependencies_satisfied(feature, features):
        print(f"Error:Feature '{feature_id}' has unmet dependencies", file=sys.stderr)
        sys.exit(1)

    feature['status'] = 'in_progress'
    save_plan(plan_path, features)
    print(f"Started feature: {feature_id}")


def cmd_complete(plan_path: str, feature_id: str):
    """Mark feature as done."""
    features = load_plan(plan_path)
    feature = get_feature_by_id(features, feature_id)

    if not feature:
        print(f"Error:Feature '{feature_id}' not found", file=sys.stderr)
        sys.exit(1)

    if feature['status'] != 'in_progress':
        print(f"Error:Feature '{feature_id}' is not in_progress (current: {feature['status']})", file=sys.stderr)
        sys.exit(1)

    feature['status'] = 'done'
    save_plan(plan_path, features)
    print(f"Completed feature: {feature_id}")

    # Check what's next
    next_feature = get_next_feature(features)
    if next_feature:
        print(f"\nNext available: {next_feature['id']}")
    else:
        remaining = [f for f in features if f['status'] != 'done']
        if remaining:
            print(f"\nWarning: {len(remaining)} features remaining but blocked by dependencies")
        else:
            print("\nAll features completed!")


def cmd_status(plan_path: str):
    """Show overall status."""
    features = load_plan(plan_path)

    status_counts = {'pending': 0, 'in_progress': 0, 'done': 0, 'skipped': 0, 'blocked': 0}

    for feature in features:
        if feature['status'] in status_counts:
            status_counts[feature['status']] += 1
        else:
            status_counts['blocked'] += 1

        # Check if pending but blocked
        if feature['status'] == 'pending' and not get_dependencies_satisfied(feature, features):
            status_counts['blocked'] += 1

    total = len(features)

    print(f"Feature List Status: {plan_path}")
    print(f"  Total: {total}")
    print(f"  Done: {status_counts['done']}")
    print(f"  In Progress: {status_counts['in_progress']}")
    print(f"  Pending: {status_counts['pending']}")
    print(f"  Blocked: {status_counts['blocked']}")
    print(f"  Skipped: {status_counts['skipped']}")

    if status_counts['in_progress'] > 0:
        print(f"\nCurrently in progress:")
        for f in features:
            if f['status'] == 'in_progress':
                print(f"  - {f['id']}: {f['function']}")

    progress = (status_counts['done'] / total * 100) if total > 0 else 0
    print(f"\nProgress: {progress:.1f}%")


def cmd_blocked(plan_path: str):
    """List blocked features and why."""
    features = load_plan(plan_path)

    blocked_features = []
    for feature in features:
        if feature['status'] == 'pending':
            unmet_deps = []
            for dep_id in feature.get('dependencies', []):
                dep = get_feature_by_id(features, dep_id)
                if not dep or dep['status'] != 'done':
                    unmet_deps.append(dep_id)

            if unmet_deps:
                blocked_features.append((feature, unmet_deps))

    if not blocked_features:
        print("No blocked features")
        return

    print(f"Blocked Features: {len(blocked_features)}")
    for feature, unmet_deps in blocked_features:
        print(f"\n  {feature['id']}: {feature['function']}")
        print(f"    Waiting on: {', '.join(unmet_deps)}")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == 'next':
        cmd_next(sys.argv[2])
    elif command == 'start':
        if len(sys.argv) < 4:
            print("Usage: python feature-manager.py start <plan.json> <feature-id>")
            sys.exit(1)
        cmd_start(sys.argv[2], sys.argv[3])
    elif command == 'complete':
        if len(sys.argv) < 4:
            print("Usage: python feature-manager.py complete <plan.json> <feature-id>")
            sys.exit(1)
        cmd_complete(sys.argv[2], sys.argv[3])
    elif command == 'status':
        cmd_status(sys.argv[2])
    elif command == 'blocked':
        cmd_blocked(sys.argv[2])
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
