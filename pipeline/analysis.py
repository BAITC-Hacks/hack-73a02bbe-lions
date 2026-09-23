from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx
import pandas as pd


ROLE_NAMES = ("consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral")


@dataclass
class PipelineResult:
    nodes_roles: pd.DataFrame
    clusters: pd.DataFrame
    top_nodes: pd.DataFrame


def _percentile(series: pd.Series, value: float) -> float:
    return float((series <= value).mean()) if len(series) else 0.0


def _rank_normalized(series: pd.Series) -> pd.Series:
    if series.empty:
        return series.astype(float)
    if float(series.max()) == float(series.min()):
        return pd.Series(0.0, index=series.index)
    return series.rank(method="average", pct=True).astype(float)


def _safe_ratio(value: float, total: float) -> float | None:
    return value / total if total > 0 else None


def _bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y", "да"}


def _truncate(text: str, limit: int = 200) -> str:
    clean = " ".join(text.split())
    return clean if len(clean) <= limit else clean[: limit - 1].rstrip() + "…"


def _evidence(row: pd.Series, role: str) -> str:
    base = (
        f"{role}: наблюдаемые входящие {int(row.in_degree)}, исходящие {int(row.out_degree)}, "
        f"объём входящих {row.in_volume_observed:.0f} KZT, исходящих {row.out_volume_observed:.0f} KZT. "
    )
    if role == "terminal":
        return _truncate(base + "Нет исходящих переводов, depth ниже границы 4; признак конечного получателя является гипотезой.")
    if role == "peripheral" and row.depth == 4 and row.out_degree == 0:
        return _truncate(base + "Граница наблюдаемого графа depth=4: terminal не подтверждён.")
    if role == "peripheral" and row.is_seed and row.out_degree == 0:
        return _truncate(base + "Seed без наблюдаемых исходящих; неполнота выборки не подтверждает terminal.")
    if role == "transit":
        return _truncate(base + f"Наблюдаемый pass-through ratio {row.pass_through_ratio:.2f}; требует ручной проверки.")
    if role == "coordinator":
        return _truncate(base + "Высокая центральность и связь с seed формируют гипотезу координирующей позиции.")
    if role == "consolidator":
        return _truncate(base + f"Много уникальных входящих контрагентов: {int(row.unique_in_neighbors)}; признак консолидации.")
    if role == "distributor":
        return _truncate(base + f"Много уникальных исходящих контрагентов: {int(row.unique_out_neighbors)}; признак распределения.")
    return _truncate(base + "Выраженных признаков остальных ролей по наблюдаемой структуре не найдено.")


def _cluster_hypothesis(cluster: pd.DataFrame) -> str:
    if len(cluster) == 1:
        return "Малый кластер; наблюдаемая роль узла требует отдельной проверки."
    if int(cluster["is_seed"].sum()) > 0 and float(cluster["out_degree"].mean()) > float(cluster["in_degree"].mean()) * 1.2:
        return "Гипотеза о распределении средств от seed к нескольким наблюдаемым получателям."
    if float(cluster["in_degree"].mean()) > float(cluster["out_degree"].mean()) * 1.2:
        return "Гипотеза о концентрации входящих переводов внутри кластера."
    if float(cluster["pass_through_ratio"].dropna().mean() or 0) >= 0.8:
        return "Гипотеза о транзитном характере части наблюдаемых переводов."
    return "Связанная группа узлов; назначение кластера требует ручной проверки."


def analyze(nodes: pd.DataFrame, edges: pd.DataFrame, transactions: pd.DataFrame) -> PipelineResult:
    del transactions  # The aggregate edge file is the canonical graph input for this batch.
    nodes = nodes.copy()
    edges = edges.copy()
    nodes["gid"] = pd.to_numeric(nodes["gid"], errors="raise").astype("int64")
    nodes["depth"] = pd.to_numeric(nodes["depth"], errors="raise").astype("int64")
    nodes["is_seed"] = nodes["is_seed"].map(_bool_value).astype(bool)
    edges["src"] = pd.to_numeric(edges["src"], errors="raise").astype("int64")
    edges["dst"] = pd.to_numeric(edges["dst"], errors="raise").astype("int64")
    edges["sum_kzt"] = pd.to_numeric(edges["sum_kzt"], errors="raise").astype(float)
    edges["n_tx"] = pd.to_numeric(edges["n_tx"], errors="raise").astype(int)

    node_ids = set(nodes["gid"].tolist())
    graph = nx.DiGraph()
    graph.add_nodes_from(node_ids)
    for edge in edges.itertuples(index=False):
        graph.add_edge(int(edge.src), int(edge.dst), sum_kzt=float(edge.sum_kzt), n_tx=int(edge.n_tx))

    undirected = nx.Graph()
    undirected.add_nodes_from(node_ids)
    for source, target, data in graph.edges(data=True):
        if undirected.has_edge(source, target):
            undirected[source][target]["weight"] += data["sum_kzt"]
        else:
            undirected.add_edge(source, target, weight=data["sum_kzt"])
    if undirected.number_of_edges():
        communities = list(nx.community.greedy_modularity_communities(undirected, weight="weight"))
    else:
        communities = [{gid} for gid in sorted(node_ids)]
    communities = sorted((sorted(community) for community in communities), key=lambda community: community[0])
    cluster_by_gid = {gid: cluster_id for cluster_id, community in enumerate(communities, start=1) for gid in community}

    degree_centrality = nx.degree_centrality(undirected) if len(node_ids) > 1 else {gid: 0.0 for gid in node_ids}
    seed_by_gid = nodes.set_index("gid")["is_seed"].to_dict()
    metrics: list[dict[str, Any]] = []
    for gid in sorted(node_ids):
        incoming = list(graph.in_edges(gid, data=True))
        outgoing = list(graph.out_edges(gid, data=True))
        in_volume = sum(float(data["sum_kzt"]) for _, _, data in incoming)
        out_volume = sum(float(data["sum_kzt"]) for _, _, data in outgoing)
        in_tx = sum(int(data["n_tx"]) for _, _, data in incoming)
        out_tx = sum(int(data["n_tx"]) for _, _, data in outgoing)
        depth = int(nodes.loc[nodes["gid"] == gid, "depth"].iloc[0])
        is_seed = bool(seed_by_gid.get(gid, False))
        pass_through = None if is_seed or in_volume <= 0 else out_volume / in_volume
        seed_neighbors = sum(1 for neighbor in undirected.neighbors(gid) if seed_by_gid.get(neighbor, False))
        metrics.append({
            "gid": gid, "in_degree": len(incoming), "out_degree": len(outgoing),
            "unique_in_neighbors": len({source for source, _, _ in incoming}),
            "unique_out_neighbors": len({target for _, target, _ in outgoing}),
            "in_volume_observed": in_volume, "out_volume_observed": out_volume,
            "n_tx_in": in_tx, "n_tx_out": out_tx, "pass_through_ratio": pass_through,
            "depth": depth, "is_seed": is_seed, "seed_neighbors": seed_neighbors,
            "centrality_proxy": float(degree_centrality.get(gid, 0.0)),
            "degree_centrality": float(degree_centrality.get(gid, 0.0)),
            "cluster_id": cluster_by_gid[gid],
        })
    frame = pd.DataFrame(metrics).set_index("gid")
    frame["volume"] = frame["in_volume_observed"] + frame["out_volume_observed"]
    frame["centrality_norm"] = _rank_normalized(frame["centrality_proxy"])
    frame["degree_norm"] = _rank_normalized(frame["degree_centrality"])
    frame["volume_norm"] = _rank_normalized(frame["volume"])
    frame["out_degree_norm"] = _rank_normalized(frame["out_degree"])
    frame["in_degree_norm"] = _rank_normalized(frame["in_degree"])
    frame["seed_norm"] = _rank_normalized(frame["seed_neighbors"])
    frame["priority_score"] = (0.4 * frame["centrality_norm"] + 0.2 * frame["degree_norm"] + 0.25 * frame["volume_norm"] + 0.15 * frame["seed_norm"]).clip(0, 1)

    p85_in = float(frame["in_degree"].quantile(0.85))
    p85_unique_in = float(frame["unique_in_neighbors"].quantile(0.85))
    p75_in_volume = float(frame["in_volume_observed"].quantile(0.75))
    p75_out = float(frame["out_degree"].quantile(0.75))
    p90_centrality = float(frame["centrality_norm"].quantile(0.90))
    p90_priority = float(frame["priority_score"].quantile(0.90))
    roles: list[str] = []
    role_scores: list[float] = []
    for gid, row in frame.iterrows():
        cluster_seed_count = int(frame[frame["cluster_id"] == row.cluster_id]["is_seed"].sum())
        if row.priority_score >= p90_priority and row.centrality_norm >= p90_centrality and (row.seed_neighbors >= 2 or cluster_seed_count >= 2):
            role, score = "coordinator", min(1.0, (row.centrality_norm + row.priority_score + min(1.0, row.seed_neighbors / 2)) / 3)
        elif row.out_degree >= p75_out and row.unique_out_neighbors >= p75_out and row.out_degree > row.in_degree:
            role, score = "distributor", min(1.0, (row.out_degree_norm + _percentile(frame["unique_out_neighbors"], row.unique_out_neighbors)) / 2)
        elif row.in_degree >= p85_in and row.unique_in_neighbors >= p85_unique_in and row.in_volume_observed >= p75_in_volume:
            role, score = "consolidator", min(1.0, (row.in_degree_norm + _percentile(frame["unique_in_neighbors"], row.unique_in_neighbors) + row.volume_norm) / 3)
        elif not row.is_seed and row.in_degree > 0 and row.out_degree > 0 and row.pass_through_ratio is not None and 0.8 <= row.pass_through_ratio <= 1.2:
            role, score = "transit", min(1.0, 1.0 - abs(1.0 - row.pass_through_ratio) / 0.2)
        elif not row.is_seed and row.out_degree == 0 and row.depth < 4:
            role, score = "terminal", 1.0
        else:
            role, score = "peripheral", max(0.0, 1.0 - row.priority_score)
        roles.append(role)
        role_scores.append(float(max(0.0, min(1.0, score))))
    frame["role"] = roles
    frame["role_score"] = role_scores
    frame["evidence"] = [_evidence(row, role) for (_, row), role in zip(frame.iterrows(), roles)]
    frame["gid"] = frame.index.astype("int64")

    nodes_roles = frame.reset_index(drop=True)[["gid", "role", "role_score", "cluster_id", "priority_score", "evidence"]]
    nodes_roles["role_score"] = nodes_roles["role_score"].clip(0, 1).round(6)
    nodes_roles["priority_score"] = nodes_roles["priority_score"].clip(0, 1).round(6)
    nodes_roles = nodes_roles.sort_values(["priority_score", "gid"], ascending=[False, True], kind="mergesort").reset_index(drop=True)

    cluster_rows: list[dict[str, Any]] = []
    for cluster_id, community in enumerate(communities, start=1):
        cluster = frame.loc[community]
        member_set = set(community)
        internal = edges[edges["src"].isin(member_set) & edges["dst"].isin(member_set)]
        top_gids = nodes_roles[nodes_roles["cluster_id"] == cluster_id].head(5)["gid"].astype(str).tolist()
        cluster_rows.append({
            "cluster_id": cluster_id, "n_nodes": len(community), "n_seed": int(cluster["is_seed"].sum()),
            "sum_kzt_internal": float(internal["sum_kzt"].sum()), "top_gids": ",".join(top_gids),
            "hypothesis": _cluster_hypothesis(cluster),
        })
    clusters = pd.DataFrame(cluster_rows, columns=["cluster_id", "n_nodes", "n_seed", "sum_kzt_internal", "top_gids", "hypothesis"])
    top_count = min(20, len(nodes_roles))
    top_nodes = nodes_roles.head(top_count).assign(rank=range(1, top_count + 1))
    top_nodes = top_nodes[["rank", "gid", "role", "priority_score", "evidence"]].rename(columns={"evidence": "why"})
    return PipelineResult(nodes_roles, clusters, top_nodes)
