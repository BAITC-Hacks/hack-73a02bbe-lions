from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from .analysis import PipelineResult, analyze


REQUIRED_COLUMNS = {
    "edges.parquet": {"src", "dst", "sum_kzt", "n_tx", "depth"},
    "nodes.parquet": {"gid", "depth", "is_seed"},
    "transactions.parquet": {"src", "dst", "date", "sum_kzt"},
}
OUTPUT_SCHEMAS = {
    "nodes_roles.csv": ["gid", "role", "role_score", "cluster_id", "priority_score", "evidence"],
    "clusters.csv": ["cluster_id", "n_nodes", "n_seed", "sum_kzt_internal", "top_gids", "hypothesis"],
    "top_nodes.csv": ["rank", "gid", "role", "priority_score", "why"],
}


def _read(path: Path, required: set[str]) -> pd.DataFrame:
    try:
        frame = pd.read_parquet(path)
    except Exception as exc:
        raise RuntimeError(f"Не удалось прочитать {path.name}: {exc}") from exc
    missing = sorted(required - set(frame.columns))
    if missing:
        raise RuntimeError(f"В {path.name} отсутствуют обязательные колонки: {', '.join(missing)}")
    return frame


def load_inputs(data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    missing = [name for name in REQUIRED_COLUMNS if not (data_dir / name).is_file()]
    if missing:
        raise RuntimeError(f"Не найдены входные файлы в {data_dir}: {', '.join(missing)}")
    edges = _read(data_dir / "edges.parquet", REQUIRED_COLUMNS["edges.parquet"])
    nodes = _read(data_dir / "nodes.parquet", REQUIRED_COLUMNS["nodes.parquet"])
    transactions = _read(data_dir / "transactions.parquet", REQUIRED_COLUMNS["transactions.parquet"])
    return nodes, edges, transactions


def _write_outputs(result: PipelineResult, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    staging = output_dir / ".staging"
    if staging.exists():
        for path in staging.iterdir():
            path.unlink()
    staging.mkdir(exist_ok=True)
    frames = {"nodes_roles.csv": result.nodes_roles, "clusters.csv": result.clusters, "top_nodes.csv": result.top_nodes}
    for name, columns in OUTPUT_SCHEMAS.items():
        frames[name][columns].to_csv(staging / name, index=False)
    for name in OUTPUT_SCHEMAS:
        (staging / name).replace(output_dir / name)
    staging.rmdir()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Cifron AI AML graph outputs from Parquet files.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    args = parser.parse_args()
    try:
        nodes, edges, transactions = load_inputs(args.data_dir)
        result = analyze(nodes, edges, transactions)
        _write_outputs(result, args.output_dir)
    except RuntimeError as exc:
        print(f"Ошибка pipeline: {exc}", file=sys.stderr)
        return 1
    print(f"Готово: {len(result.nodes_roles)} узлов, {len(result.clusters)} кластеров, {len(result.top_nodes)} top nodes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
