"""
build_analyst_dashboard.py
--------------------------
Generates a fresh "PQC Analyst — Multi-Asset Crypto Intelligence" Kibana
dashboard built purely from the live ELK schema (crypto-scans-domain,
crypto-scans-repo, crypto-scans-asset).

The dashboard is designed to remain meaningful as the dataset grows
(many domains, many repos, many endpoint agents). Every panel uses
aggregations — never raw record counts of 1.

Run:
    python build_analyst_dashboard.py            # writes ndjson + imports
    python build_analyst_dashboard.py --no-import  # writes ndjson only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KIBANA_URL = "http://localhost:5601"
NDJSON_PATH = Path(__file__).with_name("kibana-analyst-dashboard.ndjson")

DASHBOARD_ID = "pqc-analyst-dashboard"
DASHBOARD_TITLE = "PQC Analyst — Multi-Asset Crypto Intelligence"
DASHBOARD_DESC = (
    "Analyst-grade view across all crypto scans (domains, repos, endpoint "
    "agents). Built directly from Elasticsearch documents — scales to many "
    "organizations, domains, repos, and assets."
)

DV_ALL = "crypto-scans-all"
DV_DOMAIN = "crypto-scans-domain"
DV_REPO = "crypto-scans-repo"
DV_ASSET = "crypto-scans-asset"

CORE_MIG = "8.13.4"
LENS_MIG = "8.9.0"
DASH_MIG = "8.9.0"


# ---------------------------------------------------------------------------
# Lens-state builders
# ---------------------------------------------------------------------------

def _lens(
    obj_id: str,
    title: str,
    description: str,
    data_view_id: str,
    columns_order: list[str],
    columns: dict[str, dict],
    visualization: dict,
    viz_type: str,
) -> dict:
    """Wrap a Lens state into a saved-object envelope."""
    return {
        "attributes": {
            "description": description,
            "state": {
                "adHocDataViews": {},
                "datasourceStates": {
                    "formBased": {
                        "layers": {
                            "l1": {
                                "columnOrder": columns_order,
                                "columns": columns,
                                "incompleteColumns": {},
                            }
                        }
                    }
                },
                "filters": [],
                "internalReferences": [],
                "query": {"language": "kuery", "query": ""},
                "visualization": visualization,
            },
            "title": title,
            "visualizationType": viz_type,
        },
        "coreMigrationVersion": CORE_MIG,
        "id": obj_id,
        "managed": False,
        "references": [
            {
                "id": data_view_id,
                "name": "indexpattern-datasource-layer-l1",
                "type": "index-pattern",
            }
        ],
        "type": "lens",
        "typeMigrationVersion": LENS_MIG,
        "version": "1",
    }


# ---- Column builders ------------------------------------------------------

def col_count(label: str = "Count") -> dict:
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label,
        "operationType": "count",
        "params": {"emptyAsNull": True},
        "scale": "ratio",
        "sourceField": "___records___",
    }


def col_unique(field: str, label: str | None = None) -> dict:
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label or f"Unique {field}",
        "operationType": "unique_count",
        "params": {"emptyAsNull": False},
        "scale": "ratio",
        "sourceField": field,
    }


def col_sum(field: str, label: str | None = None) -> dict:
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label or f"Sum {field}",
        "operationType": "sum",
        "params": {"emptyAsNull": True},
        "scale": "ratio",
        "sourceField": field,
    }


def col_avg(field: str, label: str | None = None) -> dict:
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label or f"Avg {field}",
        "operationType": "average",
        "params": {"emptyAsNull": True},
        "scale": "ratio",
        "sourceField": field,
    }


def col_max(field: str, label: str | None = None) -> dict:
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label or f"Max {field}",
        "operationType": "max",
        "params": {"emptyAsNull": True},
        "scale": "ratio",
        "sourceField": field,
    }


def col_terms(
    field: str,
    order_col: str,
    size: int = 10,
    dtype: str = "string",
    label: str | None = None,
) -> dict:
    return {
        "dataType": dtype,
        "isBucketed": True,
        "label": label or f"Top values of {field}",
        "operationType": "terms",
        "params": {
            "missingBucket": False,
            "orderBy": {"columnId": order_col, "type": "column"},
            "orderDirection": "desc",
            "otherBucket": True,
            "size": size,
            "parentFormat": {"id": "terms"},
        },
        "scale": "ordinal",
        "sourceField": field,
    }


def col_date_hist(field: str = "scanned_at", label: str = "scanned_at") -> dict:
    return {
        "dataType": "date",
        "isBucketed": True,
        "label": label,
        "operationType": "date_histogram",
        "params": {"interval": "auto"},
        "scale": "interval",
        "sourceField": field,
    }


def col_formula(label: str, formula: str) -> dict:
    """Lens formula column (renders as nested formula+math sub-columns)."""
    return {
        "dataType": "number",
        "isBucketed": False,
        "label": label,
        "operationType": "formula",
        "params": {
            "formula": formula,
            "isFormulaBroken": False,
        },
        "references": [],
        "customLabel": True,
    }


# ---- Visualization stubs --------------------------------------------------

def viz_metric(metric_col: str, color: str | None = None) -> dict:
    v = {
        "layerId": "l1",
        "layerType": "data",
        "metricAccessor": metric_col,
    }
    if color:
        v["color"] = color
    return v


def viz_xy(
    x_col: str,
    y_cols: list[str],
    series_type: str = "line",
    split_col: str | None = None,
) -> dict:
    layer = {
        "accessors": y_cols,
        "layerId": "l1",
        "layerType": "data",
        "position": "top",
        "seriesType": series_type,
        "showGridlines": False,
        "xAccessor": x_col,
    }
    if split_col:
        layer["splitAccessor"] = split_col
    return {
        "axisTitlesVisibilitySettings": {"x": True, "yLeft": True, "yRight": True},
        "fittingFunction": "None",
        "gridlinesVisibilitySettings": {"x": True, "yLeft": True, "yRight": True},
        "labelsOrientation": {"x": 0, "yLeft": 0, "yRight": 0},
        "layers": [layer],
        "legend": {"isVisible": True, "position": "right"},
        "preferredSeriesType": series_type,
        "tickLabelsVisibilitySettings": {"x": True, "yLeft": True, "yRight": True},
        "title": "",
        "valueLabels": "hide",
    }


def viz_pie(
    bucket_col: str,
    metric_col: str,
    shape: str = "donut",
    number_display: str = "percent",
    palette: str = "default",
) -> dict:
    return {
        "layers": [
            {
                "categoryDisplay": "default",
                "layerId": "l1",
                "layerType": "data",
                "legendDisplay": "default",
                "metrics": [metric_col],
                "numberDisplay": number_display,
                "primaryGroups": [bucket_col],
            }
        ],
        "palette": {"name": palette, "type": "palette"},
        "shape": shape,
    }


def viz_datatable(column_ids: list[str]) -> dict:
    return {
        "columns": [{"columnId": cid, "isTransposed": False} for cid in column_ids],
        "layerId": "l1",
        "layerType": "data",
        "paging": {"enabled": True, "size": 20},
    }


# ---------------------------------------------------------------------------
# Build all panels
# ---------------------------------------------------------------------------

def build_lenses() -> list[dict]:
    lenses: list[dict] = []

    # ----- Row 1: Executive KPIs (height 6) --------------------------------

    # K1 Total scans
    lenses.append(_lens(
        "viz-an-kpi-total-scans",
        "Total scans (records)",
        "Total number of crypto scans indexed across all asset types.",
        DV_ALL,
        ["m"],
        {"m": col_count("Total scans")},
        viz_metric("m", "#0077CC"),
        "lnsMetric",
    ))

    # K2 Unique assets
    lenses.append(_lens(
        "viz-an-kpi-unique-assets",
        "Unique assets",
        "Distinct asset_id values across all indices.",
        DV_ALL,
        ["m"],
        {"m": col_unique("asset_id", "Unique assets")},
        viz_metric("m", "#00BFB3"),
        "lnsMetric",
    ))

    # K3 Avg PQC score
    lenses.append(_lens(
        "viz-an-kpi-avg-score",
        "Avg PQC score",
        "Average overall_score (0-100) across all scans.",
        DV_ALL,
        ["m"],
        {"m": col_avg("overall_score", "Avg PQC score")},
        viz_metric("m", "#FEC514"),
        "lnsMetric",
    ))

    # K4 Avg quantum readiness %
    lenses.append(_lens(
        "viz-an-kpi-qr-pct",
        "Avg quantum readiness %",
        "Average quantum_readiness_percentage across all scans.",
        DV_ALL,
        ["m"],
        {"m": col_avg("quantum_readiness_percentage", "Quantum readiness %")},
        viz_metric("m", "#54B399"),
        "lnsMetric",
    ))

    # K5 Total vulnerabilities
    lenses.append(_lens(
        "viz-an-kpi-vulns",
        "Total vulnerabilities",
        "Sum of vulnerabilities_count across all scans.",
        DV_ALL,
        ["m"],
        {"m": col_sum("vulnerabilities_count", "Total vulnerabilities")},
        viz_metric("m", "#BD271E"),
        "lnsMetric",
    ))

    # K6 Total findings (repo code findings)
    lenses.append(_lens(
        "viz-an-kpi-findings",
        "Total code findings",
        "Sum of findings_count across repo scans.",
        DV_REPO,
        ["m"],
        {"m": col_sum("findings_count", "Total findings")},
        viz_metric("m", "#DA8B45"),
        "lnsMetric",
    ))

    # ----- Row 2: Asset-type mix (height 10) -------------------------------

    # Donut: scans by asset_type
    lenses.append(_lens(
        "viz-an-by-asset-type",
        "Scans by asset type",
        "Distribution of scans across domain / repo / endpoint asset.",
        DV_ALL,
        ["x", "y"],
        {
            "x": col_terms("asset_type", "y", size=5),
            "y": col_count(),
        },
        viz_pie("x", "y", shape="donut", number_display="value"),
        "lnsPie",
    ))

    # Bar: avg overall_score by asset_type
    lenses.append(_lens(
        "viz-an-score-by-type",
        "Avg PQC score by asset type",
        "How each asset type is performing on overall_score (0-100).",
        DV_ALL,
        ["x", "y"],
        {
            "x": col_terms("asset_type", "y", size=10),
            "y": col_avg("overall_score", "Avg score"),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # Bar: grade distribution
    lenses.append(_lens(
        "viz-an-grade-dist",
        "Overall grade distribution",
        "Count of scans by overall_grade (A-F).",
        DV_ALL,
        ["x", "y"],
        {
            "x": col_terms("overall_grade", "y", size=15),
            "y": col_count(),
        },
        viz_xy("x", ["y"], series_type="bar"),
        "lnsXY",
    ))

    # ----- Row 3: Time-series (height 10) ----------------------------------

    # Quantum readiness trend by asset_type
    lenses.append(_lens(
        "viz-an-qr-trend",
        "Quantum readiness % over time (by asset type)",
        "Avg quantum_readiness_percentage over scanned_at, split by asset_type.",
        DV_ALL,
        ["x", "split", "y"],
        {
            "x": col_date_hist("scanned_at"),
            "split": col_terms("asset_type", "y", size=5),
            "y": col_avg("quantum_readiness_percentage", "Avg readiness %"),
        },
        viz_xy("x", ["y"], series_type="line", split_col="split"),
        "lnsXY",
    ))

    # Vulnerabilities over time stacked by asset_type
    lenses.append(_lens(
        "viz-an-vuln-trend",
        "Vulnerabilities over time (stacked by asset type)",
        "Sum of vulnerabilities_count over time, stacked by asset_type.",
        DV_ALL,
        ["x", "split", "y"],
        {
            "x": col_date_hist("scanned_at"),
            "split": col_terms("asset_type", "y", size=5),
            "y": col_sum("vulnerabilities_count", "Vulnerabilities"),
        },
        viz_xy("x", ["y"], series_type="bar_stacked", split_col="split"),
        "lnsXY",
    ))

    # ----- Row 4: Domain TLS health (height 12) ----------------------------

    # Top primary_cipher_suite
    lenses.append(_lens(
        "viz-an-dom-cipher",
        "Domains · Top primary cipher suites",
        "Most common primary_cipher_suite across domain scans.",
        DV_DOMAIN,
        ["x", "y"],
        {
            "x": col_terms("primary_cipher_suite", "y", size=10),
            "y": col_count(),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # Top public_key_algorithm
    lenses.append(_lens(
        "viz-an-dom-pka",
        "Domains · Public key algorithms",
        "Distribution of certificate public_key_algorithm (RSA / EC / PQC).",
        DV_DOMAIN,
        ["x", "y"],
        {
            "x": col_terms("public_key_algorithm", "y", size=10),
            "y": col_count(),
        },
        viz_pie("x", "y", shape="pie", number_display="value", palette="status"),
        "lnsPie",
    ))

    # Top cert issuers
    lenses.append(_lens(
        "viz-an-dom-issuer",
        "Domains · Top certificate issuers",
        "Which CAs are signing the certificates we are scanning.",
        DV_DOMAIN,
        ["x", "y"],
        {
            "x": col_terms("cert_issuer", "y", size=10),
            "y": col_count(),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # ----- Row 5: Domain hygiene KPIs (height 6) ---------------------------

    # HSTS enabled count
    lenses.append(_lens(
        "viz-an-dom-hsts",
        "Domains · HSTS enabled",
        "Number of domain scans with HSTS enabled.",
        DV_DOMAIN,
        ["bucket", "m"],
        {
            "bucket": col_terms("hsts_enabled", "m", size=2, dtype="boolean"),
            "m": col_count(),
        },
        viz_pie("bucket", "m", shape="pie", number_display="percent",
                palette="status"),
        "lnsPie",
    ))

    # OCSP stapling active
    lenses.append(_lens(
        "viz-an-dom-ocsp",
        "Domains · OCSP stapling active",
        "Number of domain scans with ocsp_stapling_active=true.",
        DV_DOMAIN,
        ["bucket", "m"],
        {
            "bucket": col_terms("ocsp_stapling_active", "m", size=2,
                                 dtype="boolean"),
            "m": col_count(),
        },
        viz_pie("bucket", "m", shape="pie", number_display="percent",
                palette="status"),
        "lnsPie",
    ))

    # Certificate Transparency present
    lenses.append(_lens(
        "viz-an-dom-ct",
        "Domains · Certificate Transparency present",
        "ct_present=true vs false across domain scans.",
        DV_DOMAIN,
        ["bucket", "m"],
        {
            "bucket": col_terms("ct_present", "m", size=2, dtype="boolean"),
            "m": col_count(),
        },
        viz_pie("bucket", "m", shape="pie", number_display="percent",
                palette="status"),
        "lnsPie",
    ))

    # Ephemeral key exchange
    lenses.append(_lens(
        "viz-an-dom-pfs",
        "Domains · Forward secrecy (ephemeral KEX)",
        "ephemeral_key_exchange=true vs false across domain scans.",
        DV_DOMAIN,
        ["bucket", "m"],
        {
            "bucket": col_terms("ephemeral_key_exchange", "m", size=2,
                                 dtype="boolean"),
            "m": col_count(),
        },
        viz_pie("bucket", "m", shape="pie", number_display="percent",
                palette="status"),
        "lnsPie",
    ))

    # ----- Row 6: Repo posture (height 12) ---------------------------------

    # Top vulnerable algorithms across all repos
    lenses.append(_lens(
        "viz-an-repo-vuln-algos",
        "Repos · Top vulnerable algorithms",
        "Most-occurring algorithm names found across vulnerable_algorithms.",
        DV_REPO,
        ["x", "y"],
        {
            "x": col_terms("vulnerable_algorithms", "y", size=20),
            "y": col_count(),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # Top repos by findings_count
    lenses.append(_lens(
        "viz-an-repo-findings-by-repo",
        "Repos · Total findings per repo",
        "Sum of findings_count grouped by repo asset_label.",
        DV_REPO,
        ["x", "y"],
        {
            "x": col_terms("asset_label", "y", size=15),
            "y": col_sum("findings_count", "Findings"),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # Repo PQC composition: sums of true_pqc_count, quantum_safe_count,
    # quantum_vulnerable_count (multi-metric bar)
    lenses.append(_lens(
        "viz-an-repo-pqc-mix",
        "Repos · Algorithm composition (PQC vs safe vs vulnerable)",
        "Across all repo scans: sum of true_pqc_count, quantum_safe_count "
        "and quantum_vulnerable_count.",
        DV_REPO,
        ["pqc", "safe", "vuln"],
        {
            "pqc": col_sum("true_pqc_count", "True PQC"),
            "safe": col_sum("quantum_safe_count", "Quantum safe"),
            "vuln": col_sum("quantum_vulnerable_count", "Quantum vulnerable"),
        },
        viz_xy("pqc", ["pqc", "safe", "vuln"], series_type="bar"),
        "lnsXY",
    ))

    # Platforms
    lenses.append(_lens(
        "viz-an-repo-platform",
        "Repos · Platforms",
        "Distribution of repo platforms (github / gitlab / bitbucket / ...).",
        DV_REPO,
        ["x", "y"],
        {
            "x": col_terms("platform", "y", size=10),
            "y": col_count(),
        },
        viz_pie("x", "y", shape="donut", number_display="percent"),
        "lnsPie",
    ))

    # ----- Row 7: Asset (endpoint) posture (height 12) ---------------------

    # FIPS mode pie
    lenses.append(_lens(
        "viz-an-asset-fips",
        "Endpoints · FIPS mode enabled",
        "fips_mode_enabled true vs false across endpoint agents.",
        DV_ASSET,
        ["x", "y"],
        {
            "x": col_terms("fips_mode_enabled", "y", size=2, dtype="boolean"),
            "y": col_count(),
        },
        viz_pie("x", "y", shape="pie", number_display="percent",
                palette="status"),
        "lnsPie",
    ))

    # Top hosts by weak_providers_count
    lenses.append(_lens(
        "viz-an-asset-weak-prov",
        "Endpoints · Weak providers by host",
        "Sum of weak_providers_count grouped by hostname.",
        DV_ASSET,
        ["x", "y"],
        {
            "x": col_terms("hostname", "y", size=15),
            "y": col_sum("weak_providers_count", "Weak providers"),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # Top hosts by weak_ciphers_count
    lenses.append(_lens(
        "viz-an-asset-weak-cph",
        "Endpoints · Weak ciphers by host",
        "Sum of weak_ciphers_count grouped by hostname.",
        DV_ASSET,
        ["x", "y"],
        {
            "x": col_terms("hostname", "y", size=15),
            "y": col_sum("weak_ciphers_count", "Weak ciphers"),
        },
        viz_xy("x", ["y"], series_type="bar_horizontal"),
        "lnsXY",
    ))

    # OS distribution
    lenses.append(_lens(
        "viz-an-asset-os",
        "Endpoints · Operating systems",
        "Distribution of os_info across endpoint agents.",
        DV_ASSET,
        ["x", "y"],
        {
            "x": col_terms("os_info", "y", size=10),
            "y": col_count(),
        },
        viz_pie("x", "y", shape="donut", number_display="value"),
        "lnsPie",
    ))

    # ----- Row 8: At-risk asset table (height 14) --------------------------

    # Worst assets table
    lenses.append(_lens(
        "viz-an-at-risk-table",
        "Top at-risk assets (lowest PQC score)",
        "Asset-label level table sorted by worst average overall_score.",
        DV_ALL,
        ["label", "atype", "grade", "score", "qr", "vulns"],
        {
            "label": col_terms("asset_label", "score", size=25),
            "atype": col_terms("asset_type", "score", size=5,
                                label="Asset type"),
            "grade": col_terms("overall_grade", "score", size=5,
                                label="Grade"),
            "score": col_avg("overall_score", "Avg score (asc)"),
            "qr": col_avg("quantum_readiness_percentage", "Avg QR %"),
            "vulns": col_sum("vulnerabilities_count", "Total vulns"),
        },
        viz_datatable(["label", "atype", "grade", "score", "qr", "vulns"]),
        "lnsDatatable",
    ))

    return lenses


# ---------------------------------------------------------------------------
# Dashboard layout
# ---------------------------------------------------------------------------

def build_dashboard(lenses: list[dict]) -> dict:
    """
    Layout panels on a 48-column grid. Each tuple is
    (panel_index, lens_id, x, y, w, h).
    """
    # x ranges over 0..47, w is column width
    layout: list[tuple[str, str, int, int, int, int]] = [
        # Row 1 — Executive KPIs (h=6)
        ("p1",  "viz-an-kpi-total-scans",      0,  0, 8,  6),
        ("p2",  "viz-an-kpi-unique-assets",    8,  0, 8,  6),
        ("p3",  "viz-an-kpi-avg-score",       16,  0, 8,  6),
        ("p4",  "viz-an-kpi-qr-pct",          24,  0, 8,  6),
        ("p5",  "viz-an-kpi-vulns",           32,  0, 8,  6),
        ("p6",  "viz-an-kpi-findings",        40,  0, 8,  6),

        # Row 2 — Asset-type mix (h=12)
        ("p7",  "viz-an-by-asset-type",        0,  6, 16, 12),
        ("p8",  "viz-an-score-by-type",       16,  6, 16, 12),
        ("p9",  "viz-an-grade-dist",          32,  6, 16, 12),

        # Row 3 — Trends (h=12)
        ("p10", "viz-an-qr-trend",             0, 18, 24, 12),
        ("p11", "viz-an-vuln-trend",          24, 18, 24, 12),

        # Row 4 — Domain TLS (h=12)
        ("p12", "viz-an-dom-cipher",           0, 30, 16, 12),
        ("p13", "viz-an-dom-pka",             16, 30, 16, 12),
        ("p14", "viz-an-dom-issuer",          32, 30, 16, 12),

        # Row 5 — Domain hygiene (h=10)
        ("p15", "viz-an-dom-hsts",             0, 42, 12, 10),
        ("p16", "viz-an-dom-ocsp",            12, 42, 12, 10),
        ("p17", "viz-an-dom-ct",              24, 42, 12, 10),
        ("p18", "viz-an-dom-pfs",             36, 42, 12, 10),

        # Row 6 — Repo posture (h=12)
        ("p19", "viz-an-repo-vuln-algos",      0, 52, 24, 12),
        ("p20", "viz-an-repo-findings-by-repo", 24, 52, 24, 12),

        # Row 7 — Repo composition + platform (h=10)
        ("p21", "viz-an-repo-pqc-mix",         0, 64, 32, 10),
        ("p22", "viz-an-repo-platform",       32, 64, 16, 10),

        # Row 8 — Endpoint (asset) posture (h=12)
        ("p23", "viz-an-asset-fips",           0, 74, 12, 12),
        ("p24", "viz-an-asset-weak-prov",     12, 74, 12, 12),
        ("p25", "viz-an-asset-weak-cph",      24, 74, 12, 12),
        ("p26", "viz-an-asset-os",            36, 74, 12, 12),

        # Row 9 — At-risk table (h=14)
        ("p27", "viz-an-at-risk-table",        0, 86, 48, 14),
    ]

    panels_json: list[dict] = []
    refs: list[dict] = []
    for panel_id, lens_id, x, y, w, h in layout:
        panels_json.append({
            "version": CORE_MIG,
            "type": "lens",
            "gridData": {"x": x, "y": y, "w": w, "h": h, "i": panel_id},
            "panelIndex": panel_id,
            "embeddableConfig": {"enhancements": {}},
            "panelRefName": f"panel_{panel_id}",
        })
        refs.append({"id": lens_id, "name": f"panel_{panel_id}", "type": "lens"})

    return {
        "attributes": {
            "description": DASHBOARD_DESC,
            "hits": 0,
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps(
                    {"query": {"language": "kuery", "query": ""}, "filter": []}
                )
            },
            "optionsJSON": json.dumps({
                "useMargins": True,
                "syncColors": False,
                "syncCursor": True,
                "syncTooltips": False,
                "hidePanelTitles": False,
            }),
            "panelsJSON": json.dumps(panels_json),
            "timeRestore": False,
            "title": DASHBOARD_TITLE,
            "version": 1,
        },
        "coreMigrationVersion": CORE_MIG,
        "id": DASHBOARD_ID,
        "managed": False,
        "references": refs,
        "type": "dashboard",
        "typeMigrationVersion": DASH_MIG,
        "version": "1",
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def write_ndjson(objs: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for obj in objs:
            fh.write(json.dumps(obj, separators=(",", ":")))
            fh.write("\n")


def import_to_kibana(path: Path, kibana_url: str = KIBANA_URL) -> None:
    url = f"{kibana_url}/api/saved_objects/_import?overwrite=true"
    with path.open("rb") as fh:
        files = {"file": (path.name, fh, "application/ndjson")}
        resp = requests.post(
            url,
            files=files,
            headers={"kbn-xsrf": "true"},
            timeout=60,
        )
    print(f"[import] HTTP {resp.status_code}")
    try:
        data = resp.json()
        print(json.dumps(data, indent=2)[:2000])
    except Exception:
        print(resp.text[:1000])
    resp.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-import", action="store_true",
                        help="Only write the ndjson file; do not POST it.")
    parser.add_argument("--kibana-url", default=KIBANA_URL)
    args = parser.parse_args()

    lenses = build_lenses()
    dashboard = build_dashboard(lenses)
    objs = [*lenses, dashboard]

    write_ndjson(objs, NDJSON_PATH)
    print(f"[write] {len(lenses)} lens panels + 1 dashboard "
          f"-> {NDJSON_PATH} ({NDJSON_PATH.stat().st_size} bytes)")

    if not args.no_import:
        import_to_kibana(NDJSON_PATH, args.kibana_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
