"""Extract voting data from como_voto/docs and generate JSON for que_dijo.
Usage: python extract_2025_data.py --year 2025
"""
import argparse
import json
import re
import shutil
from pathlib import Path
from collections import defaultdict

DOCS_DIR = Path(__file__).resolve().parent.parent / "como_voto" / "docs" / "data"
FOTOS_SRC = Path(__file__).resolve().parent.parent / "como_voto" / "docs" / "fotos"
OUTPUT_DIR = Path(__file__).resolve().parent / "public" / "data"
FOTOS_DST = Path(__file__).resolve().parent / "public" / "fotos"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_date(d_str):
    """Parse '18/09/2025 - 17:39' to '2025-09-18T17:39:00'."""
    d_str = d_str.strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})\s*-?\s*(\d{2}:\d{2})?", d_str)
    if m:
        day, month, year, time = m.groups()
        time = time or "00:00"
        return f"{year}-{month}-{day}T{time}:00"
    return d_str


def flatten_votes(vs):
    """Handle nested arrays in the vs field."""
    result = []
    for item in vs:
        if isinstance(item, dict):
            result.append(item)
        elif isinstance(item, list):
            for sub in item:
                if isinstance(sub, dict):
                    result.append(sub)
    return result


def main(year: int):
    laws_detail = load_json(DOCS_DIR / "laws_detail.json")
    legislators_full = load_json(DOCS_DIR / "legislators.json")
    votes_file = load_json(DOCS_DIR / "votes" / f"votes_{year}.json")

    vote_names = votes_file["n"]  # name array indexed by vote legislator index
    vote_data = votes_file["v"]   # {vote_vi: {party: [[afir],[neg],[abs],[aus]]}}

    # Build legislator lookup: name -> full info from legislators.json
    leg_by_key = {}
    for leg in legislators_full:
        k = leg.get("k", "")
        if k and k not in leg_by_key:
            leg_by_key[k] = leg

    # Filter laws by year — only Senado
    laws_year = [l for l in laws_detail if l.get("y") == year and l.get("ch") == "senadores"]

    # Group by (canonical_name, chamber) to merge related vote entries
    law_groups = defaultdict(list)
    for law in laws_year:
        cn = (law.get("cn") or "").strip()
        n = (law.get("n") or "").strip()
        ch = law.get("ch", "")
        key = cn if cn else n
        law_groups[(key, ch)].append(law)

    used_legislators = {}  # id -> senator data
    output_laws = []

    for (law_name, chamber), entries in sorted(law_groups.items()):
        all_votes = []
        for entry in entries:
            all_votes.extend(flatten_votes(entry.get("vs", [])))

        if not all_votes:
            continue

        law_id = f"law_{year}_{len(output_laws)}"
        law_votes = []
        first_date = None

        for v in all_votes:
            vi = str(v.get("vi", ""))
            tot = v.get("tot", [0, 0, 0, 0])

            result_raw = (v.get("r") or "").upper()
            if "AFIRMATIVO" in result_raw:
                result = "Aprobado"
            elif "NEGATIVO" in result_raw:
                result = "Rechazado"
            else:
                result = "Aprobado"

            date_str = parse_date(v.get("d", ""))
            if first_date is None:
                first_date = date_str

            # Build interventions from individual legislator votes
            interventions = []
            vd = vote_data.get(vi, {})

            for party_key in ["pj", "ucr", "pro", "lla", "cc", "oth"]:
                party_arrays = vd.get(party_key, [[], [], [], []])
                vote_options = ["Afirmativo", "Negativo", "Abstención", "Ausente"]

                for opt_idx, opt_name in enumerate(vote_options):
                    if opt_idx >= len(party_arrays):
                        continue
                    for leg_idx in party_arrays[opt_idx]:
                        if leg_idx >= len(vote_names):
                            continue
                        leg_name = vote_names[leg_idx]
                        leg_id = f"{year}_{leg_idx}"

                        if leg_id not in used_legislators:
                            info = leg_by_key.get(leg_name, {})
                            photo = info.get("ph", "")
                            if photo and not photo.startswith("http"):
                                # Keep local path like "fotos/sen_546.gif"
                                photo = photo if photo else ""
                            used_legislators[leg_id] = {
                                "id": leg_id,
                                "name": info.get("n", leg_name),
                                "party": info.get("b", "") or info.get("co", ""),
                                "province": info.get("p", ""),
                                "imageUrl": photo,
                            }

                        interventions.append({
                            "senatorId": leg_id,
                            "voteId": vi,
                            "vote": opt_name,
                        })

            # Sort: Afirmativo, Negativo, Abstención, Ausente
            vote_order = {"Afirmativo": 0, "Negativo": 1, "Abstención": 2, "Ausente": 3}
            interventions.sort(key=lambda x: (vote_order.get(x["vote"], 4), x["senatorId"]))

            vote_title = (v.get("t") or "").strip()
            # Clean up excessive whitespace/newlines
            vote_title = re.sub(r"\s+", " ", vote_title).strip()

            law_votes.append({
                "id": vi,
                "lawId": law_id,
                "title": vote_title,
                "date": date_str,
                "result": result,
                "url": v.get("url", ""),
                "summary": {
                    "afirmativo": tot[0] if len(tot) > 0 else 0,
                    "negativo": tot[1] if len(tot) > 1 else 0,
                    "abstencion": tot[2] if len(tot) > 2 else 0,
                    "ausente": tot[3] if len(tot) > 3 else 0,
                },
                "interventions": interventions,
            })

        law_votes.sort(key=lambda x: x["date"])

        # Determine law status from "En General" vote or majority
        general_votes = [v for v in law_votes if "general" in v["title"].lower()]
        if general_votes:
            status = "Aprobada" if general_votes[0]["result"] == "Aprobado" else "Rechazada"
        else:
            afirm = sum(1 for v in law_votes if v["result"] == "Aprobado")
            neg = sum(1 for v in law_votes if v["result"] == "Rechazado")
            status = "Aprobada" if afirm >= neg else "Rechazada"

        chamber_label = "Cámara de Senadores"

        output_laws.append({
            "id": law_id,
            "title": law_name,
            "description": f"{chamber_label} - {len(law_votes)} votación(es)",
            "date": first_date or "",
            "status": status,
            "chamber": chamber,
            "votes": law_votes,
        })

    output_laws.sort(key=lambda x: x.get("date", ""), reverse=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Copy photos to public/fotos/
    if FOTOS_SRC.exists():
        FOTOS_DST.mkdir(parents=True, exist_ok=True)
        copied = 0
        for src_file in FOTOS_SRC.iterdir():
            if src_file.is_file():
                dst_file = FOTOS_DST / src_file.name
                if not dst_file.exists():
                    shutil.copy2(src_file, dst_file)
                copied += 1
        print(f"  Copied {copied} photos to {FOTOS_DST}")

    laws_out = OUTPUT_DIR / f"laws_{year}.json"
    legs_out = OUTPUT_DIR / f"legislators_{year}.json"

    with open(laws_out, "w", encoding="utf-8") as f:
        json.dump(output_laws, f, ensure_ascii=False, separators=(",", ":"))

    with open(legs_out, "w", encoding="utf-8") as f:
        json.dump(used_legislators, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Output: {OUTPUT_DIR}")
    print(f"  laws_{year}.json: {len(output_laws)} laws")
    print(f"  legislators_{year}.json: {len(used_legislators)} legislators")

    # Show size
    laws_size = laws_out.stat().st_size
    legs_size = legs_out.stat().st_size
    print(f"  laws size: {laws_size / 1024:.1f} KB")
    print(f"  legislators size: {legs_size / 1024:.1f} KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract voting data for que_dijo")
    parser.add_argument("--year", type=int, required=True, help="Year to extract (e.g. 2025, 2026)")
    args = parser.parse_args()
    main(args.year)
