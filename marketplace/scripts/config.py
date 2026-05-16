"""Query OpenPowers plugin configuration.

Usage:
    python config.py <workspace> <key> [key ...]

Examples:
    python config.py /path/to/project language
    python config.py /path/to/project codebases.project codebases.reference
    python config.py /path/to/project providers.main-sdd
"""

import json
import sys
from pathlib import Path


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base. Nested dicts are merged, lists are appended."""
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        elif key in base and isinstance(base[key], list) and isinstance(value, list):
            base[key].extend(value)
        else:
            base[key] = value
    return base


def load_config(workspace: str) -> dict:
    """Load merged config: workspace/.claude/openpowers.json overrides plugin.json defaults."""
    script_dir = Path(__file__).resolve().parent
    default_path = script_dir.parent / "scripts" / "openpowers.json"
    override_path = Path(workspace) / ".claude" / "openpowers.json"

    config = {}
    if default_path.exists():
        deep_merge(config, json.loads(default_path.read_text(encoding="utf-8")))

    if override_path.exists():
        deep_merge(config, json.loads(override_path.read_text(encoding="utf-8")))

    return config


def main():
    if len(sys.argv) < 3:
        print("Usage: python config.py <workspace> <key> [key ...]", file=sys.stderr)
        print("  e.g. language", file=sys.stderr)
        print("  e.g. codebases.project", file=sys.stderr)
        print("  e.g. providers.main-brainstorm-sdd", file=sys.stderr)
        sys.exit(1)

    workspace = sys.argv[1]
    keys = sys.argv[2:]

    config = load_config(workspace)

    def query(key):
        parts = key.split(".")
        node = config
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                node = None
            if node is None:
                break
        return node

    for key in keys:
        node = query(key)
        if node is not None and not isinstance(node, dict):
            print(f"{key}={node}")
        else:
            print(f"{key}=None")


if __name__ == "__main__":
    main()
