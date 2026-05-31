"""
SSL Labs grade calculation — mirrors official criteria document.
https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide

Fix log:
  - openSslCcs: only grade F when value==2 (vulnerable), not 3 (inconclusive)
  - ticketbleed: only grade F when value==2 (vulnerable), not 3 (inconclusive)
  - bleichenbacher: only grade F when value==2 (vulnerable)
  - poodleTls: only grade C when value==2 (vulnerable)
"""


def calculate_grade(
    protocols:       list,
    suites:          list,
    leaf_cert:       dict,
    vulns:           dict,
    hsts:            dict,
    forward_secrecy: int,
    key_size:        int,
    key_alg:         str,
    named_groups:    dict = None,
) -> tuple:
    """Returns (grade, grade_trust_ignored, has_warnings, notices).

    notices — list of SSL-Labs-style informational strings shown in the UI.
    """
    proto_ids    = {p["id"] for p in protocols}
    has_warnings = False
    notices      = []

    # ── Immediate F ──────────────────────────────────────────────────────────
    if vulns.get("heartbleed"):
        return "F", "F", False, []

    if vulns.get("poodle") or vulns.get("drownVulnerable"):
        return "F", "F", False, []

    if vulns.get("freak") or vulns.get("logjam"):
        return "F", "F", False, []

    if 512 in proto_ids or 768 in proto_ids:   # SSLv2 or SSLv3 accepted
        return "F", "F", False, []

    # FIX: only F if value==2 (confirmed vulnerable), not 3 (inconclusive/test failed)
    if vulns.get("openSslCcs") == 2:
        return "F", "F", False, []

    if vulns.get("bleichenbacher") == 2:
        return "F", "F", False, []

    # FIX: ticketbleed==2 means confirmed vulnerable, 3 = inconclusive
    if vulns.get("ticketbleed") == 2:
        return "F", "F", False, []

    # ── Certificate trust issues ──────────────────────────────────────────────
    cert_issues = leaf_cert.get("issues", 0)
    if cert_issues & 1:   # expired
        return "T", "T", False, []
    if cert_issues & 2:   # not yet valid
        return "T", "T", False, []

    # ── Start at A ───────────────────────────────────────────────────────────
    grade = "A"

    # ── Weak key ─────────────────────────────────────────────────────────────
    if key_alg == "RSA" and key_size < 2048:
        grade = min_grade(grade, "F")
    elif key_alg == "RSA" and key_size < 4096:
        has_warnings = True

    # ── Protocol score ────────────────────────────────────────────────────────
    # TLS 1.0 or 1.1 present → cap at B
    if 769 in proto_ids or 770 in proto_ids:
        grade = min_grade(grade, "B")
        legacy = []
        if 769 in proto_ids: legacy.append("TLS 1.0")
        if 770 in proto_ids: legacy.append("TLS 1.1")
        notices.append(
            f"This server supports {' and '.join(legacy)}. Grade capped to B."
        )

    # ── TLS 1.3 notice ───────────────────────────────────────────────────────
    if 772 in proto_ids:
        notices.append("This server supports TLS 1.3.")

    # ── Forward secrecy ───────────────────────────────────────────────────────
    if forward_secrecy == 0:
        grade = min_grade(grade, "B")
        has_warnings = True
    elif forward_secrecy == 1:
        has_warnings = True

    # ── RC4 ──────────────────────────────────────────────────────────────────
    if vulns.get("supportsRc4"):
        grade = min_grade(grade, "B")
        has_warnings = True

    # ── BEAST warning (no grade penalty, just warning) ────────────────────────
    if vulns.get("vulnBeast"):
        has_warnings = True

    # ── Weak cipher strength ──────────────────────────────────────────────────
    all_strengths = [
        s.get("cipherStrength", 128)
        for proto in suites
        for s in proto.get("list", [])
    ]
    if all_strengths:
        min_strength = min(all_strengths)
        if min_strength < 112:
            grade = min_grade(grade, "C")
        elif min_strength < 128:
            grade = min_grade(grade, "B")
            has_warnings = True

    # ── POODLE-TLS ────────────────────────────────────────────────────────────
    # FIX: only penalise on value==2 (confirmed), not -3 (not tested)
    if vulns.get("poodleTls") == 2:
        grade = min_grade(grade, "C")

    # ── Zombie POODLE / Golden Doodle ─────────────────────────────────────────
    if vulns.get("zombiePoodle") == 2 or vulns.get("goldenDoodle") == 2:
        grade = min_grade(grade, "C")

    # ── 3DES / weak cipher ────────────────────────────────────────────────────
    has_3des = any(
        "3DES" in s.get("name", "") or "DES-CBC3" in s.get("name", "")
        for proto in suites for s in proto.get("list", [])
    )
    if has_3des:
        has_warnings = True

    # ── PQC key exchange notice ───────────────────────────────────────────────
    pqc_groups = []
    if named_groups:
        pqc_groups = [
            g for g in named_groups.get("list", [])
            if g.get("type") == "PQC-Hybrid"
        ]
    if pqc_groups:
        names = ", ".join(g.get("name", "") for g in pqc_groups[:3])
        notices.append(f"This server supports PQC hybrid key exchange ({names}).")
    else:
        notices.append(
            "This server does not support PQC (Post-Quantum Cryptography) key exchange."
        )

    # ── A+ requires long HSTS ─────────────────────────────────────────────────
    if grade == "A":
        hsts_max_age = hsts.get("maxAge") or 0
        if hsts.get("status") == "present" and hsts_max_age >= 15552000:
            grade = "A+"

    return grade, grade, has_warnings, notices


GRADE_ORDER = ["A+", "A", "B", "C", "D", "E", "F", "T", "M"]


def min_grade(a: str, b: str) -> str:
    """Return the worse of two grades."""
    try:
        return GRADE_ORDER[max(GRADE_ORDER.index(a), GRADE_ORDER.index(b))]
    except ValueError:
        return "T"