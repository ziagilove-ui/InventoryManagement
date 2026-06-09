import json
import os
from pathlib import Path
from typing import Any


MEMBERS_PATH = Path(os.getenv("MEMBERS_FILE", "data/members.json"))


class MemberStore:
    def __init__(self, path: Path = MEMBERS_PATH) -> None:
        self.path = path

    def get_or_create_member(self, email: str, name: str) -> dict[str, Any]:
        members = self._load_members()
        member = members.get(email)
        if member is None:
            role = self._initial_role(email, members)
            member = {
                "email": email,
                "name": name,
                "role": role,
                "enabled": True,
            }
            members[email] = member
        else:
            member["name"] = name or member.get("name", "")

        self._save_members(members)
        return member

    def get_member(self, email: str) -> dict[str, Any] | None:
        return self._load_members().get(email)

    def list_members(self) -> list[dict[str, Any]]:
        return sorted(self._load_members().values(), key=lambda member: member["email"])

    def update_member(self, email: str, role: str, enabled: bool) -> dict[str, Any]:
        if role not in {"admin", "viewer"}:
            raise ValueError("Invalid role")

        members = self._load_members()
        member = members.get(email)
        if member is None:
            member = {
                "email": email,
                "name": "",
                "role": role,
                "enabled": enabled,
            }
            members[email] = member
        else:
            member["role"] = role
            member["enabled"] = enabled

        self._save_members(members)
        return member

    def _initial_role(self, email: str, members: dict[str, dict[str, Any]]) -> str:
        initial_admin = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
        if initial_admin and email.lower() == initial_admin:
            return "admin"
        if not members and not initial_admin:
            return "admin"
        return "viewer"

    def _load_members(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}

        data = json.loads(self.path.read_text(encoding="utf-8"))
        return {member["email"]: member for member in data.get("members", [])}

    def _save_members(self, members: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {"members": sorted(members.values(), key=lambda member: member["email"])}
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
