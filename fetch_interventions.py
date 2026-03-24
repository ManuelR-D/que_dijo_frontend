"""
Fetch intervention data from the candidatos-back API and match to frontend votes.

Matches backend topics to frontend votes using O.D. numbers and keyword overlap,
then fetches real intervention texts. Outputs interventions_{year}.json.

Incremental: saves progress per-topic to a cache file. Re-run to resume.

Requires: candidatos-back API running on localhost:5101
Usage: python fetch_interventions.py --year 2025
"""
import argparse
import json
import re
import subprocess
import time
import unicodedata
import urllib.request
from pathlib import Path
from collections import defaultdict

API_BASE = "http://localhost:5101"
DOCKER_CONTAINER = "senate_db"
DOCKER_DB = "senate_db"
DOCKER_USER = "senate_user"
OUTPUT_DIR = Path(__file__).resolve().parent / "public" / "data"
CACHE_FILE = OUTPUT_DIR / "_topic_cache.json"


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            resp = urllib.request.urlopen(url, timeout=30)
            return json.loads(resp.read())
        except Exception as e:
            if attempt < retries - 1:
                print(f"    Retry {attempt+1}/{retries-1}: {e}")
                time.sleep(0.5)
            else:
                raise


def load_cache():
    """Load previously fetched topic data."""
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    """Save topic data cache to disk."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))


def docker_psql(sql):
    """Run a SQL query via docker exec on the senate_db container.
    Returns the output as a list of tab-separated rows (no header)."""
    result = subprocess.run(
        ["docker", "exec", DOCKER_CONTAINER,
         "psql", "-U", DOCKER_USER, "-d", DOCKER_DB,
         "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")
    return [line for line in result.stdout.strip().split("\n") if line]


def fetch_all_from_db(name_index):
    """Fetch all topic/intervention data directly from the DB via docker exec.

    Replaces the per-topic API calls. Returns a cache dict with the same
    structure as the file-based cache: {str(topic_id): {leg_id: {...}}}.

    Args:
        name_index: {normalized_last_name: legislator_id} from build_legislator_name_index.
    """
    print("Fetching all data from DB via docker exec...")

    # 1) Topics with interventions
    topics_rows = docker_psql(
        "SELECT t.UniqueID, t.Name, ss.Date "
        "FROM Topic t "
        "JOIN SenateSession ss ON t.SenateSession_id = ss.UniqueID "
        "WHERE EXISTS (SELECT 1 FROM Intervention i WHERE i.Topic_id = t.UniqueID);"
    )
    topics = []
    for row in topics_rows:
        parts = row.split("\t")
        topics.append({
            "topic_id": int(parts[0]),
            "name": parts[1],
            "session_date": parts[2],
        })
    print(f"  {len(topics)} topics with interventions")

    # 2) All interventions joined with representative info and summaries
    interventions_rows = docker_psql(
        "SELECT i.Topic_id, r.UniqueID, r.Full_name, r.Last_name, "
        "       COALESCE(REPLACE(REPLACE(rts.Summary, E'\\n', ' '), E'\\r', ' '), ''), "
        "       REPLACE(REPLACE(i.Text, E'\\n', ' '), E'\\r', ' '), "
        "       i.Intervention_order "
        "FROM Intervention i "
        "JOIN Representative r ON i.Representative_id = r.UniqueID "
        "LEFT JOIN RepresentativeTopicSummary rts "
        "  ON rts.Representative_id = r.UniqueID AND rts.Topic_id = i.Topic_id "
        "ORDER BY i.Topic_id, r.UniqueID, i.Intervention_order;"
    )
    print(f"  {len(interventions_rows)} intervention rows fetched")

    # 3) Group into cache structure
    # Intermediate: {topic_id: {rep_uuid: {last_name, full_name, summary, texts: []}}}
    grouped = defaultdict(lambda: defaultdict(lambda: {
        "last_name": "", "full_name": "", "summary": "", "texts": []
    }))
    for row in interventions_rows:
        parts = row.split("\t")
        if len(parts) < 4:
            continue
        topic_id = parts[0]
        rep_uuid = parts[1]
        full_name = parts[2]
        last_name = parts[3]
        summary = parts[4] if len(parts) > 4 else ""
        text = parts[5] if len(parts) > 5 else ""
        entry = grouped[topic_id][rep_uuid]
        entry["last_name"] = last_name
        entry["full_name"] = full_name
        if summary:
            entry["summary"] = summary
        if text:
            entry["texts"].append(text)

    # 4) Convert to cache format matching the API-based cache
    cache = {}
    for topic_id, reps in grouped.items():
        topic_data = {}
        for rep_uuid, info in reps.items():
            norm_last = normalize_name(info["last_name"])
            leg_id = name_index.get(norm_last)
            if not leg_id:
                continue
            texts = info["texts"]
            if not texts:
                continue
            transcript = "\n\n".join(texts)
            longest = max(texts, key=len)
            excerpt = longest[:200].rsplit(" ", 1)[0] + "..." if len(longest) > 200 else longest
            topic_data[leg_id] = {
                "summary": info["summary"],
                "transcript": transcript,
                "excerpt": excerpt,
                "repName": info["full_name"],
            }
        if topic_data:
            cache[topic_id] = topic_data

    print(f"  {len(cache)} topics with matched legislator interventions")
    return cache, topics

def strip_accents(s):
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def normalize_name(name):
    """Normalize a name for comparison: uppercase, no accents, no punctuation."""
    name = strip_accents(name.upper())
    name = re.sub(r"[^A-Z\s]", "", name)
    return " ".join(name.split())


def extract_od(text):
    """Extract O.D. number like '701/25' from text."""
    m = re.search(r"O\.?D\.?\s*(?:N[°º]\s*)?(\d+/\d+)", text, re.IGNORECASE)
    return m.group(1) if m else None


def normalize_od(od):
    """Normalize '701/2025' → '701/25'."""
    if not od:
        return None
    parts = od.split("/")
    if len(parts) == 2:
        num, year = parts
        if len(year) == 4:
            year = year[2:]
        return f"{num}/{year}"
    return od


def keyword_overlap(text_a, text_b, min_word_len=5, min_overlap=4):
    """Check if two texts share enough significant words."""
    words_a = set(re.findall(rf"\w{{{min_word_len},}}", text_a.lower()))
    words_b = set(re.findall(rf"\w{{{min_word_len},}}", text_b.lower()))
    return words_a & words_b


def match_topics_to_votes(topics, votes_by_id):
    """
    Match backend topics to frontend votes.
    Returns {vote_id: [topic_ids]}.
    """
    # Index topics by O.D. number
    topics_by_od = defaultdict(list)
    for t in topics:
        od = normalize_od(extract_od(t["name"]))
        if od:
            topics_by_od[od].append(t)

    vote_to_topics = {}
    matched_topic_ids = set()

    # Pass 1: Match by O.D. number
    # When multiple votes share the same O.D., pick the best vote for each topic
    # by title similarity. Procedural votes ("moción de orden") should not get
    # substantive debate topics.
    for od, od_topics in topics_by_od.items():
        od_votes = [(vid, vinfo) for vid, vinfo in votes_by_id.items()
                    if normalize_od(extract_od(vinfo["title"])) == od]
        if not od_votes:
            continue

        if len(od_votes) == 1:
            # Only one vote for this O.D. — assign all topics
            vid = od_votes[0][0]
            tids = [t["topic_id"] for t in od_topics]
            vote_to_topics[vid] = tids
            matched_topic_ids.update(tids)
        else:
            # Multiple votes share the same O.D. — assign topics to the best matching vote
            # Score each vote against each topic by keyword overlap
            for topic in od_topics:
                best_vid = None
                best_score = -1
                for vid, vinfo in od_votes:
                    overlap = keyword_overlap(vinfo["title"], topic["name"], min_word_len=4)
                    score = len(overlap)
                    # Penalize procedural votes
                    if "moción" in vinfo["title"].lower() or "habilitación" in vinfo["title"].lower():
                        score -= 3
                    if score > best_score:
                        best_score = score
                        best_vid = vid
                if best_vid:
                    vote_to_topics.setdefault(best_vid, []).append(topic["topic_id"])
                    matched_topic_ids.add(topic["topic_id"])

    # Pass 2: Keyword fallback for unmatched votes
    unmatched_topics = [t for t in topics if t["topic_id"] not in matched_topic_ids]
    for vid, vinfo in votes_by_id.items():
        if vid in vote_to_topics:
            continue
        vtitle = vinfo["title"]
        vdate = vinfo.get("date", "")[:10]
        best_match = None
        best_score = 0
        for t in unmatched_topics:
            if t["topic_id"] in matched_topic_ids:
                continue
            # Prefer same session date
            tdate = t.get("session_date", "")
            overlap = keyword_overlap(vtitle, t["name"])
            score = len(overlap)
            if tdate == vdate:
                score += 2  # bonus for date match
            if score > best_score and score >= 4:
                best_score = score
                best_match = t
        if best_match:
            vote_to_topics[vid] = [best_match["topic_id"]]
            matched_topic_ids.add(best_match["topic_id"])

    return vote_to_topics


def build_legislator_name_index(legislators):
    """Build {normalized_last_name: legislator_id} from frontend data."""
    index = {}
    for lid, leg in legislators.items():
        name = leg.get("name", "")
        # Frontend names are like "ABDALA, Bartolomé Esteban" or "SORIA, Martin Ignacio"
        parts = name.split(",")
        if parts:
            last = normalize_name(parts[0].strip())
            if last and last not in index:
                index[last] = lid
    return index


def match_representative_to_legislator(rep, name_index):
    """Match a backend representative to a frontend legislator by last name."""
    last = normalize_name(rep.get("last_name", ""))
    return name_index.get(last)


def main(year: int, use_docker: bool = False):
    laws_file = OUTPUT_DIR / f"laws_{year}.json"
    legislators_file = OUTPUT_DIR / f"legislators_{year}.json"

    print("Loading frontend data...")
    with open(laws_file, "r", encoding="utf-8") as f:
        laws = json.load(f)
    with open(legislators_file, "r", encoding="utf-8") as f:
        legislators = json.load(f)

    # Build vote index: {vote_id: {title, date}}
    votes_by_id = {}
    for law in laws:
        for v in law["votes"]:
            votes_by_id[v["id"]] = {"title": v["title"], "date": v["date"]}

    print(f"  {len(laws)} laws, {len(votes_by_id)} votes, {len(legislators)} legislators")

    # Build legislator name index
    name_index = build_legislator_name_index(legislators)

    if use_docker:
        print("Fetching all data from Docker DB...")
        cache, topics = fetch_all_from_db(name_index)
        topics_with_interventions = topics  # already filtered to those with interventions
    else:
        # Fetch topics from API
        print("Fetching topics from API...")
        data = fetch(f"{API_BASE}/api/topics")
        all_topics = data["data"]["topics"]
        topics_with_interventions = [t for t in all_topics if t["intervention_count"] > 0]
        print(f"  {len(all_topics)} total topics, {len(topics_with_interventions)} with interventions")

    # Match topics to votes
    print("Matching topics to votes...")
    vote_to_topics = match_topics_to_votes(topics_with_interventions, votes_by_id)
    print(f"  {len(vote_to_topics)} votes matched to backend topics")

    if not use_docker:
        # Fetch intervention data for each unique topic, then map back to votes
        print("Fetching interventions from API...")
        # Load cache of already-fetched topics
        cache = load_cache()  # {str(topic_id): {leg_id: {...}}}
        unique_topic_ids = set()
        for tids in vote_to_topics.values():
            unique_topic_ids.update(tids)

        already = [tid for tid in unique_topic_ids if str(tid) in cache]
        remaining = sorted(tid for tid in unique_topic_ids if str(tid) not in cache)
        print(f"  {len(unique_topic_ids)} unique topics, {len(already)} cached, {len(remaining)} to fetch")

        for i, topic_id in enumerate(remaining, 1):
            print(f"  [{i}/{len(remaining)}] Fetching topic {topic_id}...")
            topic_data = {}

            try:
                reps_data = fetch(f"{API_BASE}/api/topics/{topic_id}/representatives")
            except Exception as e:
                print(f"    Warning: failed to fetch reps for topic {topic_id}: {e}")
                # Save what we have so far and bail
                save_cache(cache)
                print(f"    Progress saved ({len(cache)} topics cached). Re-run to resume.")
                return

            reps = reps_data["data"].get("representatives", [])

            for rep in reps:
                rep_id = rep["id"]
                leg_id = match_representative_to_legislator(rep, name_index)
                if not leg_id:
                    continue

                try:
                    int_data = fetch(
                        f"{API_BASE}/api/representatives/{rep_id}/topics/{topic_id}/interventions"
                    )
                except Exception as e:
                    print(f"    Warning: failed for rep {rep_id}: {e}")
                    save_cache(cache)
                    print(f"    Progress saved ({len(cache)} topics cached). Re-run to resume.")
                    return

                d = int_data["data"]
                summary = d.get("summary") or ""
                texts = [iv["text"] for iv in d.get("interventions", []) if iv.get("text")]

                if not texts:
                    continue

                transcript = "\n\n".join(texts)
                # Use the longest fragment for the excerpt (texts[0] can be a short "Presidenta.")
                longest = max(texts, key=len)
                excerpt = longest[:200].rsplit(" ", 1)[0] + "..." if len(longest) > 200 else longest

                topic_data[leg_id] = {
                    "summary": summary,
                    "transcript": transcript,
                    "excerpt": excerpt,
                    "repName": rep.get("full_name", ""),
                }

            cache[str(topic_id)] = topic_data
            save_cache(cache)

    # Map back to votes using cache
    interventions_data = {}
    for vote_id, topic_ids in vote_to_topics.items():
        vote_interventions = {}
        for topic_id in topic_ids:
            for leg_id, data in cache.get(str(topic_id), {}).items():
                if leg_id not in vote_interventions:
                    vote_interventions[leg_id] = data
        if vote_interventions:
            interventions_data[vote_id] = vote_interventions

    # Count stats
    total_interventions = sum(len(v) for v in interventions_data.values())
    print(f"  {len(interventions_data)} votes with intervention data, {total_interventions} total senator interventions")

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"interventions_{year}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(interventions_data, f, ensure_ascii=False, separators=(",", ":"))

    size = out_path.stat().st_size
    print(f"\nOutput: {out_path}")
    print(f"  Size: {size / 1024:.1f} KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch interventions for que_dijo")
    parser.add_argument("--year", type=int, required=True, help="Year to process (e.g. 2025, 2026)")
    parser.add_argument("--docker", action="store_true",
                        help="Fetch data directly from Docker DB instead of the API")
    args = parser.parse_args()
    main(args.year, use_docker=args.docker)
