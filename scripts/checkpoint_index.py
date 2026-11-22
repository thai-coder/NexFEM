#!/usr/bin/env python3
"""Generate PROJECT_STATUS.md from the front matter of docs/checkpoints/*.md.

Usage:
  python3 scripts/checkpoint_index.py           # rewrite PROJECT_STATUS.md
  python3 scripts/checkpoint_index.py --check   # exit 1 if it is stale or a header is invalid
  python3 scripts/checkpoint_index.py --latest  # fetch, then list the most recently pushed
                                                # branches with the agent/session that pushed them

Standard library only. Do not edit PROJECT_STATUS.md by hand: when it conflicts in a
merge or rebase, run this script and stage the result.
"""
from __future__ import annotations

import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKPOINTS = ROOT / "docs" / "checkpoints"
INDEX = ROOT / "PROJECT_STATUS.md"

STATUSES = ["IN_PROGRESS", "PAUSED", "BLOCKED", "REVIEW", "DONE"]
REQUIRED = ["id", "title", "status", "owner", "updated"]
OPTIONAL = ["branch", "pr", "parent", "session"]
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SKIP = {"README.md", "_TEMPLATE.md"}


def parse(path: Path) -> tuple[dict[str, str], list[str]]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, [f"{path.name}: thiếu phần đầu '---'"]
    meta: dict[str, str] = {}
    for i, line in enumerate(lines[1:], start=2):
        if line.strip() == "---":
            break
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        key = key.strip()
        if not sep or key not in REQUIRED + OPTIONAL:
            errors.append(f"{path.name}:{i}: khoá không hợp lệ '{line.strip()}'")
            continue
        if key in meta:
            errors.append(f"{path.name}:{i}: khoá '{key}' bị lặp")
        meta[key] = value.strip().strip('"')
    else:
        return meta, errors + [f"{path.name}: thiếu dòng '---' đóng phần đầu"]

    for key in REQUIRED:
        if not meta.get(key):
            errors.append(f"{path.name}: thiếu '{key}'")
    if meta.get("id") and meta["id"] != path.stem:
        errors.append(f"{path.name}: id '{meta['id']}' phải trùng tên file '{path.stem}'")
    if meta.get("id") and not ID_RE.match(meta["id"]):
        errors.append(f"{path.name}: id chỉ dùng a-z, 0-9 và '-'")
    if meta.get("status") and meta["status"] not in STATUSES:
        errors.append(f"{path.name}: status phải là một trong {', '.join(STATUSES)}")
    if meta.get("updated") and parse_updated(meta["updated"]) is None:
        errors.append(
            f"{path.name}: updated phải có dạng YYYY-MM-DDTHH:MM+07:00 (hoặc YYYY-MM-DD cho checkpoint cũ)"
        )
    if meta.get("pr") and not re.fullmatch(r"\d+", meta["pr"]):
        errors.append(f"{path.name}: pr chỉ ghi số PR, ví dụ 19")
    return meta, errors


def parse_updated(value: str) -> datetime | None:
    """Timestamp with an explicit offset, or a bare date (legacy) read as 00:00 UTC."""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return datetime.combine(date.fromisoformat(value), datetime.min.time(), timezone.utc)
        except ValueError:
            return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt.astimezone(timezone.utc) if dt.tzinfo else None


def utc(value: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    return parse_updated(value).strftime("%Y-%m-%d %H:%M UTC")


def cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def render(entries: list[dict[str, str]]) -> str:
    order = {s: i for i, s in enumerate(STATUSES)}
    entries = sorted(entries, key=lambda e: e["id"])
    entries.sort(key=lambda e: parse_updated(e["updated"]), reverse=True)
    last = entries[0] if entries else None
    entries.sort(key=lambda e: order[e["status"]] == order["DONE"])

    out = [
        "# NexFEM — Chỉ mục checkpoint",
        "",
        "<!-- File sinh tự động bởi scripts/checkpoint_index.py. Không sửa tay. -->",
        "",
        "Mỗi nhiệm vụ có một file checkpoint riêng trong [docs/checkpoints/](docs/checkpoints/README.md). "
        "Đọc bảng này, rồi mở đúng file của nhiệm vụ cần tiếp tục và đối chiếu với nhánh, PR và CI. "
        "Quy trình: [docs/HANDOFF.md](docs/HANDOFF.md).",
        "",
        "Nếu file này xung đột khi merge hoặc rebase: chạy `python3 scripts/checkpoint_index.py` rồi stage lại.",
        "",
    ]
    if last:
        who = cell(last["owner"]) + (f", phiên {cell(last['session'])}" if last.get("session") else "")
        out += [
            f"**Checkpoint cập nhật gần nhất:** [{last['id']}](docs/checkpoints/{last['id']}.md) "
            f"— {last['status']} — {who} — {utc(last['updated'])}.",
            "",
        ]
    out += [
        "Chỉ mục chỉ thấy checkpoint đã vào `main`. Để biết phiên nào đẩy commit gần nhất trên mọi nhánh, "
        "chạy `python3 scripts/checkpoint_index.py --latest`.",
        "",
        "| Nhiệm vụ | Trạng thái | Người làm | Nhánh | PR | Cập nhật | Tóm tắt |",
        "|---|---|---|---|---|---|---|",
    ]
    for e in entries:
        link = f"[{e['id']}](docs/checkpoints/{e['id']}.md)"
        branch = f"`{e['branch']}`" if e.get("branch") else ""
        pr = (
            f"[#{e['pr']}](https://github.com/thai-coder/NexFEM/pull/{e['pr']})"
            if e.get("pr")
            else ""
        )
        title = e["title"]
        if e.get("parent"):
            title += f" (thuộc `{e['parent']}`)"
        out.append(
            f"| {link} | {e['status']} | {cell(e['owner'])} | {branch} | {pr} | {utc(e['updated'])} | {cell(title)} |"
        )
    out.append("")
    return "\n".join(out)


AGENT_TRAILERS = re.compile(r"^(Agent|[\w-]*-Session|Co-Authored-By):\s*(.+)$", re.I | re.M)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def latest(limit: int) -> int:
    """List the most recently committed remote branches and who/which session pushed them."""
    try:
        git("fetch", "--quiet", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*")
    except subprocess.CalledProcessError as exc:
        print(f"Không fetch được origin, dùng dữ liệu cục bộ: {exc.stderr.strip()}", file=sys.stderr)
    refs = git(
        "for-each-ref", "--sort=-committerdate", f"--count={limit}", "refs/remotes/origin",
        "--format=%(refname:short)%09%(objectname:short)%09%(committerdate:iso-strict)",
    ).splitlines()
    print("Nhánh mới nhất trước (giờ commit, UTC). Phiên lấy từ trailer Agent / *-Session của commit đầu nhánh.\n")
    for line in refs:
        ref, sha, when = line.split("\t")
        if ref in ("origin", "origin/HEAD"):
            continue
        body = git("log", "-1", "--format=%an%x00%s%x00%B", sha)
        author, subject, message = body.split("\x00", 2)
        tags = [f"{k}: {v.strip()}" for k, v in AGENT_TRAILERS.findall(message)]
        stamp = datetime.fromisoformat(when).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
        agent = "; ".join(tags) if tags else f"không có trailer phiên (tác giả git: {author})"
        print(f"{stamp}  {ref.removeprefix('origin/')}  {sha}\n    {subject}\n    {agent}")
    return 0


def main(argv: list[str]) -> int:
    if "--latest" in argv:
        return latest(12)
    check = "--check" in argv
    entries: list[dict[str, str]] = []
    errors: list[str] = []
    for path in sorted(CHECKPOINTS.glob("*.md")):
        if path.name in SKIP:
            continue
        meta, errs = parse(path)
        errors += errs
        if not errs:
            entries.append(meta)
    ids = {e["id"] for e in entries}
    for e in entries:
        if e.get("parent") and e["parent"] not in ids:
            errors.append(f"{e['id']}.md: parent '{e['parent']}' không có file checkpoint")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    content = render(entries)
    current = INDEX.read_text(encoding="utf-8") if INDEX.exists() else ""
    if check:
        if current != content:
            print(
                "PROJECT_STATUS.md chưa khớp với docs/checkpoints/. "
                "Chạy: python3 scripts/checkpoint_index.py",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {len(entries)} checkpoint, chỉ mục khớp.")
        return 0
    if current != content:
        INDEX.write_text(content, encoding="utf-8")
        print(f"Đã ghi PROJECT_STATUS.md ({len(entries)} checkpoint).")
    else:
        print(f"PROJECT_STATUS.md đã khớp ({len(entries)} checkpoint).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
